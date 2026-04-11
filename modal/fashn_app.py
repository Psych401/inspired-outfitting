"""
Modal worker: FASHN VTON v1.5 virtual try-on for the Inspired Outfitting Next.js backend.

Contract matches lib/try-on/providers/modal-http.ts and app/api/try-on/webhook/route.ts:
  POST JSON (camelCase/snake_case): jobId, personBase64, outfitBase64, personMime, outfitMime,
                         category, garment_photo_type, webhookUrl, webhookSecret
  Response: { "mode": "async", "providerJobId": "<jobId>" }
  Webhook POST to webhookUrl with body + Authorization Bearer + X-Webhook-Secret header.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import time
from pathlib import Path
from typing import Any, Literal

import modal
from pydantic import BaseModel

# -----------------------------------------------------------------------------
# Paths & app
# -----------------------------------------------------------------------------

THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent


def _resolve_fashn_root() -> Path:
    # Modal may execute this file from /modal/fashn_app.py, where parent.parent == "/".
    # Probe common local dev/build locations and use the first valid source dir.
    candidates = (
        Path("/opt/fashn-vton-1.5"),
        REPO_ROOT / "tryon-models" / "fashn-vton-1.5",
        Path.cwd() / "tryon-models" / "fashn-vton-1.5",
        Path("/root/tryon-models/fashn-vton-1.5"),
        THIS_DIR / "tryon-models" / "fashn-vton-1.5",
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return candidates[0]


FASHN_ROOT = _resolve_fashn_root()

if not FASHN_ROOT.is_dir():
    logging.getLogger("fashn_modal").warning(
        "FASHN source path not found at import time (%s). Continuing because /opt/fashn-vton-1.5 may be populated during image build.",
        FASHN_ROOT,
    )

APP_NAME = "inspired-fashn-vton"
VOLUME_NAME = "fashn-vton-v15-weights"
SECRET_NAME = "fashn-tryon-secrets"
HANDLER_VERSION = "cost-first-v1-single-use"

# Cost-first autoscaler: no warm idle containers, no buffer pool, short idle drain.
# single_use_containers=True ensures one input per container then shutdown (cold starts OK).
COST_MIN_CONTAINERS = 0
COST_BUFFER_CONTAINERS = 0
COST_SCALEDOWN_WINDOW_SEC = 10

# Default diffusion steps (override with FASHN_NUM_TIMESTEPS).
DEFAULT_FASHN_NUM_TIMESTEPS = 30

app = modal.App(APP_NAME)
weights_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
tryon_secrets = modal.Secret.from_name(SECRET_NAME)
# Hugging Face Hub token (set HF_TOKEN in Modal dashboard for this secret).
HF_SECRET_NAME = "hf-secret"
hf_secret = modal.Secret.from_name(HF_SECRET_NAME)
# Bundle app secrets + HF token for workers that run Hub downloads / inference.
hf_worker_secrets = [tryon_secrets, hf_secret]

logger = logging.getLogger("fashn_modal")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

# -----------------------------------------------------------------------------
# Hugging Face auth bootstrap (one-time at startup)
# -----------------------------------------------------------------------------

_hf_auth_initialized = False


def init_hf_auth_once() -> None:
    """
    Initialize HF Hub authentication once per process at startup.
    - Reads HF_TOKEN from env
    - Mirrors token to HUGGINGFACE_HUB_TOKEN for downstream libraries
    - Optionally enables hf_transfer acceleration
    - Never logs or exposes token value
    """
    global _hf_auth_initialized
    if _hf_auth_initialized:
        return
    _hf_auth_initialized = True

    # Optional transfer acceleration (safe no-op when unsupported)
    os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")

    hf_token = (os.environ.get("HF_TOKEN") or "").strip()
    if not hf_token:
        logger.info("hf_auth: no HF_TOKEN found; continuing unauthenticated")
        return

    os.environ["HUGGINGFACE_HUB_TOKEN"] = hf_token
    try:
        from huggingface_hub import login

        # in-process login so all huggingface_hub calls are authenticated
        login(token=hf_token)
        logger.info("hf_auth: authenticated Hugging Face Hub client")
    except Exception as e:
        # Do not crash startup; fall back to env-token behavior where possible
        logger.warning("hf_auth: login() failed, continuing with env token only (%s)", e)


init_hf_auth_once()

# -----------------------------------------------------------------------------
# Images
# -----------------------------------------------------------------------------

fashn_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libglib2.0-0",
        "libgl1",
        "libsm6",
        "libxext6",
        "libxrender1",
        "libgomp1",
    )
    .run_commands(
        "pip install --no-cache-dir torch==2.4.1 torchvision==0.19.1 "
        "--extra-index-url https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "safetensors>=0.3.0",
        "huggingface_hub>=0.20.0",
        "pillow>=9.0.0",
        "numpy>=1.21.0",
        "opencv-python-headless>=4.5.0",
        "tqdm>=4.65.0",
        "einops>=0.6.0",
        "onnxruntime-gpu>=1.16.0",
        "matplotlib>=3.5.0",
        "fashn-human-parser>=0.1.1",
        "fastapi>=0.109.0",
        "httpx>=0.26.0",
        "pydantic>=2.5.0",
        "filelock>=3.13.0",
    )
    .add_local_dir(
        local_path=str(FASHN_ROOT),
        remote_path="/opt/fashn-vton-1.5",
        copy=True,
    )
    .run_commands("pip install --no-cache-dir --no-deps /opt/fashn-vton-1.5")
)

web_image = (
    modal.Image.debian_slim(python_version="3.11").pip_install(
        "fastapi>=0.109.0",
        "uvicorn[standard]>=0.27.0",
        "httpx>=0.26.0",
        "pydantic>=2.5.0",
    )
)

# -----------------------------------------------------------------------------
# Weight download (Hugging Face → /weights, then volume.commit)
# -----------------------------------------------------------------------------


def _hf_token() -> str | None:
    t = (
        os.environ.get("HF_TOKEN")
        or os.environ.get("HUGGINGFACE_HUB_TOKEN")
        or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        or ""
    ).strip()
    if not t or t.lower() in ("none", "optional", "public"):
        return None
    return t


def download_fashn_weights(weights_dir: str) -> bool:
    """Download TryOn + DWPose ONNX weights into weights_dir (idempotent, file-locked).

    Returns True if any download ran (caller may volume.commit); False if all files already present.
    """
    from filelock import FileLock
    from huggingface_hub import hf_hub_download

    root = Path(weights_dir)
    root.mkdir(parents=True, exist_ok=True)
    lock = FileLock(str(root / ".download.lock"), timeout=3600)
    token = _hf_token()

    with lock:
        model = root / "model.safetensors"
        yolox = root / "dwpose" / "yolox_l.onnx"
        dw = root / "dwpose" / "dw-ll_ucoco_384.onnx"
        if model.is_file() and yolox.is_file() and dw.is_file():
            logger.info("weights_skip_already_present dir=%s", weights_dir)
            return False

        (root / "dwpose").mkdir(parents=True, exist_ok=True)
        logger.info("Downloading fashn-vton-1.5 weights…")
        hf_hub_download(
            repo_id="fashn-ai/fashn-vton-1.5",
            filename="model.safetensors",
            local_dir=str(root),
            token=token,
        )
        for filename in ("yolox_l.onnx", "dw-ll_ucoco_384.onnx"):
            hf_hub_download(
                repo_id="fashn-ai/DWPose",
                filename=filename,
                local_dir=str(root / "dwpose"),
                token=token,
            )
        logger.info("Download complete.")
        return True


def warm_human_parser_cache(hf_home: str) -> bool:
    """Prime Hugging Face cache on the volume for fashn-human-parser.

    Returns True if priming ran; False if a previous run already left a marker (skip redundant work).
    """
    Path(hf_home).mkdir(parents=True, exist_ok=True)
    marker = Path(hf_home) / ".human_parser_warmed"
    if marker.is_file():
        logger.info("human_parser_cache_skip hf_home=%s", hf_home)
        return False

    os.environ["HF_HOME"] = hf_home
    from fashn_human_parser import FashnHumanParser

    FashnHumanParser(device="cpu")
    marker.write_text("ok", encoding="utf-8")
    logger.info("Human parser weights cached under %s", hf_home)
    return True


# -----------------------------------------------------------------------------
# Webhook client (bounded retries + total time cap — avoids runaway GPU + HTTP loops)
# -----------------------------------------------------------------------------

# Aggressive cost protection: short HTTP per attempt, few retries, tight total wall time.
WEBHOOK_HTTP_TIMEOUT_S = 10.0
WEBHOOK_MAX_ATTEMPTS = 2
WEBHOOK_MAX_TOTAL_S = 15.0


def _webhook_headers(webhook_secret: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {webhook_secret}",
        "X-Webhook-Secret": webhook_secret,
        "Accept": "application/json",
    }


def post_webhook(
    url: str,
    body: dict[str, Any],
    webhook_secret: str,
) -> None:
    """POST JSON to Next.js; retries only for transient errors (5xx/429), bounded by count + wall time."""
    import httpx

    headers = _webhook_headers(webhook_secret)
    job_id = body.get("jobId")
    last_err: Exception | None = None
    t_start = time.monotonic()
    t_wall_start = time.perf_counter()

    for attempt in range(WEBHOOK_MAX_ATTEMPTS):
        elapsed = time.monotonic() - t_start
        if elapsed >= WEBHOOK_MAX_TOTAL_S:
            break
        # Fit this attempt's HTTP timeout inside remaining 15s budget (2 attempts max).
        per_req_timeout = min(WEBHOOK_HTTP_TIMEOUT_S, WEBHOOK_MAX_TOTAL_S - elapsed)
        if per_req_timeout < 0.5:
            break
        try:
            with httpx.Client(timeout=per_req_timeout) as client:
                r = client.post(url, json=body, headers=headers)
            logger.info(
                "webhook_response jobId=%s status=%s attempt=%s",
                job_id,
                r.status_code,
                attempt + 1,
            )
            if 200 <= r.status_code < 300:
                wh_ms = int((time.perf_counter() - t_wall_start) * 1000)
                logger.info(
                    "webhook_delivery_succeeded jobId=%s http_status=%s attempt=%s webhook_wall_ms=%s",
                    job_id,
                    r.status_code,
                    attempt + 1,
                    wh_ms,
                )
                return
            # Fail fast on client errors (except rate limit) — do not spin retries / GPU time
            if 400 <= r.status_code < 500 and r.status_code != 429:
                raise RuntimeError(f"webhook client error {r.status_code}: {r.text[:500]}")
            last_err = RuntimeError(f"webhook HTTP {r.status_code}: {r.text[:300]}")
        except Exception as e:
            last_err = e
            logger.warning("Webhook attempt %s failed jobId=%s: %s", attempt + 1, job_id, e)
        if attempt < WEBHOOK_MAX_ATTEMPTS - 1:
            rem = WEBHOOK_MAX_TOTAL_S - (time.monotonic() - t_start)
            if rem > 0.2:
                time.sleep(min(0.2, rem * 0.5))

    wh_ms = int((time.perf_counter() - t_wall_start) * 1000)
    logger.error("webhook_delivery_failed jobId=%s webhook_wall_ms=%s err=%s", job_id, wh_ms, last_err)
    logger.info("webhook_timing jobId=%s webhook_wall_ms=%s success=False", job_id, wh_ms)
    if last_err is not None:
        raise last_err
    raise RuntimeError("webhook: no attempts completed within time budget")


def post_webhook_best_effort(
    url: str,
    body: dict[str, Any],
    webhook_secret: str,
) -> None:
    try:
        post_webhook(url, body, webhook_secret)
    except Exception:
        logger.exception("Webhook delivery failed after retries (jobId=%s)", body.get("jobId"))


def post_webhook_failure_notice(
    url: str,
    job_id: str,
    error: str,
    webhook_secret: str,
    gpu_duration_ms: int | None = None,
) -> None:
    """Single attempt to notify app that we could not complete or deliver the primary webhook."""
    import httpx

    payload: dict[str, Any] = {
        "jobId": job_id,
        "status": "failed",
        "error": error[:2000],
    }
    if gpu_duration_ms is not None:
        payload["gpuDurationMs"] = gpu_duration_ms
    try:
        with httpx.Client(timeout=WEBHOOK_HTTP_TIMEOUT_S) as client:
            r = client.post(url, json=payload, headers=_webhook_headers(webhook_secret))
        logger.info("failure_notice_response jobId=%s status=%s", job_id, r.status_code)
    except Exception:
        logger.exception("failure_notice failed jobId=%s", job_id)


# -----------------------------------------------------------------------------
# Ingress: webhook preflight + distributed job idempotency (Modal Dict)
# -----------------------------------------------------------------------------

CLAIM_DICT_NAME = "fashn-tryon-job-claims-v1"


def preflight_webhook_reachable(webhook_url: str) -> None:
    """
    Fail before GPU if the callback URL cannot be reached (e.g. ngrok tunnel stopped).
    Expects GET /api/try-on/webhook to return 200 JSON ping (see Next.js route).
    """
    import httpx

    url = (webhook_url or "").strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise RuntimeError("webhook_unreachable_preflight: invalid webhookUrl scheme")

    try:
        r = httpx.get(url, timeout=5.0, follow_redirects=True)
    except httpx.RequestError as e:
        raise RuntimeError(f"webhook_unreachable_preflight: connection_error {e}") from e

    text = (r.text or "")[:8000]
    low = text.lower()
    if r.status_code == 404 and (
        "ngrok" in low
        and ("offline" in low or "err_ngrok" in low or "3200" in text or "endpoint" in low)
    ):
        raise RuntimeError("webhook_unreachable_preflight: ngrok_tunnel_offline (ERR_NGROK_3200-style)")
    if r.status_code >= 500:
        raise RuntimeError(f"webhook_unreachable_preflight: upstream_http_{r.status_code}")
    if r.status_code == 404:
        raise RuntimeError(
            "webhook_unreachable_preflight: http_404 — deploy GET ping on /api/try-on/webhook or start tunnel"
        )
    if r.status_code in (200, 204):
        logger.info("webhook_preflight_ok status=%s (GET ping reachable)", r.status_code)
        return
    if r.status_code in (401, 405):
        # Tunnel up; route may require POST only — still reachable
        logger.info("webhook_preflight_ok status=%s (reachable, non-GET route)", r.status_code)
        return
    logger.info("webhook_preflight_ok status=%s (treating as reachable)", r.status_code)


@app.function(
    image=web_image,
    secrets=hf_worker_secrets,
    timeout=30,
    max_containers=1,
    single_use_containers=True,
    min_containers=COST_MIN_CONTAINERS,
    buffer_containers=COST_BUFFER_CONTAINERS,
    scaledown_window=COST_SCALEDOWN_WINDOW_SEC,
)
def job_claim_coordinator(job_id: str, action: str) -> dict[str, Any]:
    """
    Serialize claim/release: one container, one in-flight claim at a time, plus Modal Dict.
    Avoids duplicate GPU spawns for the same jobId across ingress replicas.
    """
    claims = modal.Dict.from_name(CLAIM_DICT_NAME, create_if_missing=True)
    if action == "claim":
        if job_id in claims:
            return {"claimed": False}
        claims[job_id] = time.time()
        return {"claimed": True}
    if action == "release":
        try:
            if job_id in claims:
                del claims[job_id]
        except Exception:
            logger.exception("job_claim_release_delete_failed jobId=%s", job_id)
        return {"released": True}
    return {"error": "unknown_action"}


# -----------------------------------------------------------------------------
# Inference helpers
# -----------------------------------------------------------------------------

FashnCategory = Literal["tops", "bottoms", "one-pieces"]
GarmentPhotoType = Literal["flat-lay", "model"]

MAX_B64_CHARS = 40_000_000
MAX_DECODED_BYTES = 30_000_000


class TryOnRequest(BaseModel):
    jobId: str
    personBase64: str
    outfitBase64: str
    personMime: str | None = None
    outfitMime: str | None = None
    category: FashnCategory
    garment_photo_type: GarmentPhotoType
    webhookUrl: str
    webhookSecret: str


def _decode_image_b64(data_b64: str, field: str):
    from PIL import Image

    if len(data_b64) > MAX_B64_CHARS:
        raise ValueError(f"{field}: base64 too large")
    try:
        raw = base64.b64decode(data_b64, validate=True)
    except Exception as e:
        raise ValueError(f"{field}: invalid base64") from e
    if len(raw) > MAX_DECODED_BYTES:
        raise ValueError(f"{field}: decoded image too large")
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise ValueError(f"{field}: not a valid image") from e


def validate_try_on_payload(d: dict[str, Any]) -> dict[str, Any]:
    required = (
        "jobId",
        "personBase64",
        "outfitBase64",
        "category",
        "garment_photo_type",
        "webhookUrl",
        "webhookSecret",
    )
    for k in required:
        if k not in d or d[k] is None or (isinstance(d[k], str) and not d[k].strip()):
            raise ValueError(f"missing or empty field: {k}")
    category = d["category"]
    if category not in ("tops", "bottoms", "one-pieces"):
        raise ValueError("category must be one of ['tops', 'bottoms', 'one-pieces']")
    garment_photo_type = d["garment_photo_type"]
    if garment_photo_type not in ("flat-lay", "model"):
        raise ValueError("garment_photo_type must be one of ['flat-lay', 'model']")
    url = str(d["webhookUrl"])
    allowed_dev = "localhost" in url or "127.0.0.1" in url
    if not url.startswith("https://") and not (allowed_dev and url.startswith("http://")):
        raise ValueError("webhookUrl must be https, or http for localhost/127.0.0.1 only")
    return d


# -----------------------------------------------------------------------------
# Populate volume (run once: modal run modal/fashn_app.py::populate)
# -----------------------------------------------------------------------------


@app.function(
    image=fashn_image,
    volumes={"/weights": weights_volume},
    secrets=hf_worker_secrets,
    timeout=3600,
    cpu=4.0,
    memory=8192,
)
def populate_weights_volume() -> str:
    download_fashn_weights("/weights")
    warm_human_parser_cache("/weights/hf_hub_cache")
    weights_volume.commit()
    return "ok: weights and parser cache written to volume"


@app.local_entrypoint()
def populate() -> None:
    """Download weights into the Modal Volume (recommended before first production traffic)."""
    print(populate_weights_volume.remote())


# -----------------------------------------------------------------------------
# GPU worker
# -----------------------------------------------------------------------------


# Hard cap GPU wall time — Modal force-stops the container at this limit (aggressive billing protection).
GPU_CLASS_TIMEOUT_SEC = 180  # 3 minutes max; normal try-on should finish well under this

@app.cls(
    image=fashn_image,
    gpu="A10G",
    volumes={"/weights": weights_volume},
    secrets=hf_worker_secrets,
    timeout=GPU_CLASS_TIMEOUT_SEC,
    min_containers=COST_MIN_CONTAINERS,
    buffer_containers=COST_BUFFER_CONTAINERS,
    scaledown_window=COST_SCALEDOWN_WINDOW_SEC,
    single_use_containers=True,
    memory=24576,
)
class TryOnGpu:
    pipeline: Any = None

    @modal.enter()
    def load(self) -> None:
        t_enter = time.perf_counter()
        os.environ["HF_HOME"] = "/weights/hf_hub_cache"
        Path("/weights/hf_hub_cache").mkdir(parents=True, exist_ok=True)

        did_weights = download_fashn_weights("/weights")
        did_parser = warm_human_parser_cache("/weights/hf_hub_cache")
        if did_weights or did_parser:
            weights_volume.commit()

        t_pipe = time.perf_counter()
        from fashn_vton import TryOnPipeline

        self.pipeline = TryOnPipeline(weights_dir="/weights", device="cuda")
        pipeline_init_ms = int((time.perf_counter() - t_pipe) * 1000)
        cold_start_enter_ms = int((time.perf_counter() - t_enter) * 1000)
        logger.info(
            "gpu_cold_start_timing cold_start_enter_total_ms=%s pipeline_init_ms=%s weights_downloaded=%s parser_warmed=%s",
            cold_start_enter_ms,
            pipeline_init_ms,
            did_weights,
            did_parser,
        )
        logger.info("TryOnPipeline ready on GPU.")

    @modal.method()
    def run(self, payload: dict[str, Any]) -> None:
        payload = validate_try_on_payload(payload)
        job_id = str(payload["jobId"])
        webhook_url = str(payload["webhookUrl"])
        secret = str(payload["webhookSecret"])
        category = str(payload["category"])
        garment_photo_type = str(payload["garment_photo_type"])
        t0 = time.perf_counter()
        logger.info("gpu_run_start jobId=%s (same id as Next.js created)", job_id)

        try:
            t_decode0 = time.perf_counter()
            person = _decode_image_b64(str(payload["personBase64"]), "personBase64")
            garment = _decode_image_b64(str(payload["outfitBase64"]), "outfitBase64")
            decode_ms = int((time.perf_counter() - t_decode0) * 1000)

            num_timesteps = int(os.environ.get("FASHN_NUM_TIMESTEPS", str(DEFAULT_FASHN_NUM_TIMESTEPS)))
            seed = int(os.environ.get("FASHN_SEED", "42"))

            t_inf0 = time.perf_counter()
            result = self.pipeline(
                person_image=person,
                garment_image=garment,
                category=category,
                garment_photo_type=garment_photo_type,
                num_samples=1,
                num_timesteps=num_timesteps,
                guidance_scale=1.5,
                seed=seed,
                segmentation_free=True,
            )
            inference_ms = int((time.perf_counter() - t_inf0) * 1000)
            if not result.images:
                raise RuntimeError("pipeline returned no images")

            buf = io.BytesIO()
            result.images[0].save(buf, format="JPEG", quality=92, optimize=True)
            result_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            gpu_ms = int((time.perf_counter() - t0) * 1000)

            logger.info(
                "gpu_job_timing jobId=%s decode_ms=%s inference_ms=%s timesteps=%s gpu_wall_ms=%s",
                job_id,
                decode_ms,
                inference_ms,
                num_timesteps,
                gpu_ms,
            )

            success_body = {
                "jobId": job_id,
                "status": "succeeded",
                "resultBase64": result_b64,
                "mimeType": "image/jpeg",
                "gpuDurationMs": gpu_ms,
            }
            try:
                post_webhook(webhook_url, success_body, secret)
            except Exception as wh_err:
                logger.exception("Success webhook delivery failed jobId=%s", job_id)
                post_webhook_failure_notice(
                    webhook_url,
                    job_id,
                    f"Result ready but primary webhook failed: {wh_err}",
                    secret,
                    gpu_ms,
                )
        except Exception as e:
            logger.exception("Try-on failed jobId=%s", job_id)
            gpu_ms = int((time.perf_counter() - t0) * 1000)
            fail_body = {
                "jobId": job_id,
                "status": "failed",
                "error": str(e)[:2000],
                "gpuDurationMs": gpu_ms,
            }
            post_webhook_best_effort(webhook_url, fail_body, secret)
        finally:
            try:
                job_claim_coordinator.remote(job_id, "release")
                logger.info("job_claim_released jobId=%s", job_id)
            except Exception:
                logger.exception("job_claim_release_failed jobId=%s", job_id)
            wall_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("gpu_run_finished jobId=%s wall_ms=%s", job_id, wall_ms)


# -----------------------------------------------------------------------------
# HTTP ingress (CPU): validate, auth, spawn GPU
# -----------------------------------------------------------------------------


def _check_ingress_auth(authorization: str | None) -> None:
    from fastapi import HTTPException

    expected = (os.environ.get("MODAL_INGRESS_API_KEY") or "").strip()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    token = authorization[7:].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid bearer token")


@app.function(
    image=web_image,
    secrets=hf_worker_secrets,
    timeout=120,
    min_containers=COST_MIN_CONTAINERS,
    buffer_containers=COST_BUFFER_CONTAINERS,
    scaledown_window=COST_SCALEDOWN_WINDOW_SEC,
)
@modal.asgi_app()
def try_on_api() -> Any:
    from fastapi import FastAPI, Header, HTTPException
    from fastapi.responses import JSONResponse

    web = FastAPI(title="FASHN VTON Modal worker", version="1.0.0")

    @web.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "handlerVersion": HANDLER_VERSION}

    async def try_on_handler(
        payload: TryOnRequest,
        authorization: str | None = Header(default=None),
    ):
        logger.info(
            "ingress_received jobId=%s handlerVersion=%s",
            payload.jobId,
            HANDLER_VERSION,
        )
        _check_ingress_auth(authorization)
        try:
            payload_dict = validate_try_on_payload(payload.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        job_id = str(payload_dict["jobId"])

        claim_result = await job_claim_coordinator.remote.aio(job_id, "claim")
        if not claim_result.get("claimed"):
            logger.warning("duplicate_job_ignored jobId=%s gpu_spawn_skipped=True", job_id)
            return JSONResponse(
                status_code=202,
                content={
                    "mode": "async",
                    "providerJobId": job_id,
                    "accepted": True,
                    "duplicate": True,
                    "handlerVersion": HANDLER_VERSION,
                },
            )

        try:
            await asyncio.to_thread(preflight_webhook_reachable, str(payload_dict["webhookUrl"]))
            logger.info("webhook_preflight_passed jobId=%s", job_id)
        except Exception as e:
            logger.warning("webhook_unreachable_preflight jobId=%s err=%s", job_id, e)
            await job_claim_coordinator.remote.aio(job_id, "release")
            raise HTTPException(status_code=503, detail=str(e)) from e

        logger.info("ingress_spawning_gpu jobId=%s", job_id)
        try:
            await TryOnGpu().run.spawn.aio(payload_dict)
        except Exception:
            await job_claim_coordinator.remote.aio(job_id, "release")
            raise

        return JSONResponse(
            status_code=202,
            content={
                "mode": "async",
                "providerJobId": job_id,
                "accepted": True,
                "handlerVersion": HANDLER_VERSION,
            },
        )

    web.add_api_route("/", try_on_handler, methods=["POST"])
    web.add_api_route("/try-on", try_on_handler, methods=["POST"])

    return web
