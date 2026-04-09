# FASHN VTON v1.5 on Modal

Python worker that matches the Next.js virtual try-on scaffold:

- **Ingress** (`try_on_api`): validates JSON, optional Bearer auth, returns **202** `{ "mode": "async", "providerJobId", "accepted" }`, and spawns GPU work.
- **GPU** (`TryOnGpu`, **A10G**): loads weights from a **Modal Volume** (`/weights`), runs `TryOnPipeline`, then **POSTs** to your app’s `webhookUrl` with the same contract as `app/api/try-on/webhook/route.ts` (body fields + `X-Webhook-Secret` header).

Field names are mostly **camelCase** with required FASHN fields `category` and `garment_photo_type` to match `lib/try-on/providers/modal-http.ts`.

## Prerequisites

1. [Modal](https://modal.com) account and CLI: `pip install modal` then `modal token new`.
2. This repo includes `tryon-models/fashn-vton-1.5` (source only; large weights are **not** baked into the image — see `.modalignore`).
3. Create a secret (same name as in `fashn_app.py`):

```bash
modal secret create fashn-tryon-secrets HF_TOKEN=hf_YourToken
```

Optional (recommended): same value as Next.js `MODAL_API_KEY` so the worker can verify callers:

```bash
modal secret create fashn-tryon-secrets HF_TOKEN=hf_xxx MODAL_INGRESS_API_KEY=your-long-random-string
```

`HF_TOKEN` can be omitted for fully public Hub assets by setting `HF_TOKEN=none` (the app treats that as “no token”).

## One-time: fill the weights volume

Avoid slow first GPU cold-starts:

```bash
modal run modal/fashn_app.py::populate
```

This runs `populate_weights_volume` (downloads `model.safetensors`, DWPose ONNX, and primes `fashn-human-parser` cache onto the volume).

## Deploy

From the **repository root**:

```bash
modal deploy modal/fashn_app.py
```

Copy the HTTPS URL shown for **`try_on_api`** (ends in `.modal.run`). Use it as `MODAL_TRY_ON_ENDPOINT` in Next.js (POST to `/` or `/try-on` — both work).

## Health check

`GET /health` → `{ "status": "ok" }`.

## Environment (Next.js `.env.local`)

| Variable | Purpose |
|----------|---------|
| `MODAL_TRY_ON_ENDPOINT` | Full URL of deployed `try_on_api` (e.g. `https://…try-on-api.modal.run`) |
| `MODAL_API_KEY` | Optional; if set, sent as `Authorization: Bearer …` — must match Modal secret `MODAL_INGRESS_API_KEY` when that secret is set |
| `MODAL_WEBHOOK_SECRET` | Must match the `webhookSecret` the app sends (same string in Modal is not required; the worker echoes the secret from the request) |
| `TRY_ON_GPU_PROVIDER` | `modal` or `auto` |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the Next app so the worker can POST `/api/try-on/webhook` (use an ngrok/https URL in dev) |

## Test curl (ingress)

Replace `URL`, `BEARER` (if using ingress auth), and base64 placeholders.

```bash
curl -sS -X POST "https://YOUR_WORKSPACE--inspired-fashn-vton-try-on-api.modal.run/try-on" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_MODAL_INGRESS_API_KEY" ^
  -d "{\"jobId\":\"test_job_1\",\"personBase64\":\"BASE64_PERSON\",\"outfitBase64\":\"BASE64_GARMENT\",\"personMime\":\"image/jpeg\",\"outfitMime\":\"image/jpeg\",\"category\":\"tops\",\"garment_photo_type\":\"flat-lay\",\"webhookUrl\":\"https://YOUR_APP/api/try-on/webhook\",\"webhookSecret\":\"SAME_AS_MODAL_WEBHOOK_SECRET\"}"
```

On Unix shells, use single quotes around the JSON and `\` for line continuation.

## Connect the frontend (next steps)

1. Deploy Modal and set `MODAL_TRY_ON_ENDPOINT` (+ optional `MODAL_API_KEY` / `MODAL_INGRESS_API_KEY` pair).
2. Ensure `NEXT_PUBLIC_APP_URL` is reachable from the public internet (Modal workers call your webhook from their network).
3. Use the existing dress-yourself / try-on UI; it should hit your Next API, which forwards to Modal and completes via webhook.

## End-to-end test

1. Run `populate` once, then `modal deploy modal/fashn_app.py`.
2. Start Next locally with a **public** base URL (e.g. [ngrok](https://ngrok.com/) → `NEXT_PUBLIC_APP_URL=https://….ngrok-free.app`).
3. Set `MODAL_WEBHOOK_SECRET` in Next to a strong value; the try-on API includes that secret in the payload to Modal, and the worker posts it back to `/api/try-on/webhook`.
4. Trigger a try-on from the UI or API; confirm the job moves to `succeeded` and an image returns.

## Files in this folder

| File | Role |
|------|------|
| `fashn_app.py` | Modal `App`, Volume, GPU class, HTTP ASGI app, webhook client, weight download |
| `requirements-fashn-worker.txt` | Pip deps for the GPU image (torch installed separately in code) |
| `README.md` | This document |

Repo root `.modalignore` keeps local `weights/` and caches out of the Modal build context.

## Tunables (Modal dashboard or secret)

Set on the `TryOnGpu` class via Modal environment if needed:

- `FASHN_NUM_TIMESTEPS` (default `30`)
- `FASHN_SEED` (default `42`)

## License

FASHN VTON v1.5 is Apache-2.0; verify compliance for your product. See `tryon-models/fashn-vton-1.5/LICENSE`.
