-- Supabase persistence for billing, credits, try-on jobs, and image metadata.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id text primary key,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_billing_state (
  user_id text primary key references app_users(id) on delete cascade,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  subscription_tier text not null default 'none',
  subscription_status text not null default 'none',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_billing_state_updated_at on user_billing_state(updated_at desc);

create table if not exists stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_stripe_webhook_events_created_at on stripe_webhook_events(created_at desc);

create table if not exists try_on_jobs (
  id uuid primary key,
  user_id text not null references app_users(id) on delete cascade,
  status text not null,
  provider text not null,
  provider_job_id text,
  category text not null,
  garment_photo_type text not null,
  credit_cost_debited integer not null default 0,
  credit_refund_issued boolean not null default false,
  success boolean,
  error_message text,
  error_code text,
  generated_image_id uuid,
  source_person_image_id uuid,
  source_garment_image_id uuid,
  request_id text,
  retry_count integer not null default 0,
  request_duration_ms integer,
  gpu_duration_ms integer,
  estimated_cost_usd numeric(10,6),
  result_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_try_on_jobs_user_created on try_on_jobs(user_id, created_at desc);
create index if not exists idx_try_on_jobs_provider_job on try_on_jobs(provider_job_id);
create index if not exists idx_try_on_jobs_status_updated on try_on_jobs(status, updated_at desc);

create table if not exists user_images (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  job_id uuid references try_on_jobs(id) on delete set null,
  image_type text not null check (image_type in ('person','garment','generated')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  source_person_image_id uuid references user_images(id) on delete set null,
  source_garment_image_id uuid references user_images(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_user_images_user_created on user_images(user_id, created_at desc);
create index if not exists idx_user_images_job on user_images(job_id);
create unique index if not exists uq_user_images_bucket_path on user_images(storage_bucket, storage_path);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_try_on_generated_image'
  ) then
    alter table try_on_jobs
      add constraint fk_try_on_generated_image
      foreign key (generated_image_id) references user_images(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_try_on_source_person'
  ) then
    alter table try_on_jobs
      add constraint fk_try_on_source_person
      foreign key (source_person_image_id) references user_images(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_try_on_source_garment'
  ) then
    alter table try_on_jobs
      add constraint fk_try_on_source_garment
      foreign key (source_garment_image_id) references user_images(id) on delete set null;
  end if;
end
$$;

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  job_id uuid references try_on_jobs(id) on delete set null,
  stripe_event_id text,
  entry_type text not null check (entry_type in ('grant','debit','refund','adjustment')),
  credits_delta integer not null,
  balance_after integer,
  reason text not null,
  source_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_ledger_user_created on credit_ledger(user_id, created_at desc);
create index if not exists idx_credit_ledger_job on credit_ledger(job_id);
create index if not exists idx_credit_ledger_stripe on credit_ledger(stripe_event_id);

create table if not exists try_on_job_logs (
  id bigint generated always as identity primary key,
  job_id uuid not null references try_on_jobs(id) on delete cascade,
  level text not null check (level in ('info','warn','error')),
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_try_on_job_logs_job_created on try_on_job_logs(job_id, created_at asc);

create or replace function app_ensure_user_billing_row(p_user_id text, p_default_credits integer default 0)
returns void language plpgsql as $$
begin
  insert into app_users(id, email) values (lower(trim(p_user_id)), lower(trim(p_user_id)))
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into user_billing_state(user_id, credit_balance, subscription_tier, subscription_status)
  values (lower(trim(p_user_id)), p_default_credits, 'none', 'none')
  on conflict (user_id) do nothing;
end;
$$;

create or replace function app_debit_credits(
  p_user_id text,
  p_amount integer,
  p_reason text,
  p_job_id uuid default null,
  p_source_key text default null,
  p_default_credits integer default 0
)
returns table(ok boolean, balance integer)
language plpgsql
as $$
declare
  v_balance integer;
begin
  perform app_ensure_user_billing_row(p_user_id, p_default_credits);
  update user_billing_state
    set credit_balance = credit_balance - p_amount,
        updated_at = now()
    where user_id = lower(trim(p_user_id))
      and credit_balance >= p_amount
    returning credit_balance into v_balance;

  if v_balance is null then
    select credit_balance into v_balance from user_billing_state where user_id = lower(trim(p_user_id));
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  insert into credit_ledger(user_id, job_id, entry_type, credits_delta, balance_after, reason, source_key)
  values (lower(trim(p_user_id)), p_job_id, 'debit', -p_amount, v_balance, p_reason, p_source_key);

  return query select true, v_balance;
end;
$$;

create or replace function app_grant_credits(
  p_user_id text,
  p_amount integer,
  p_reason text,
  p_source_key text default null,
  p_job_id uuid default null,
  p_stripe_event_id text default null,
  p_default_credits integer default 0
)
returns table(balance integer)
language plpgsql
as $$
declare
  v_balance integer;
begin
  perform app_ensure_user_billing_row(p_user_id, p_default_credits);

  update user_billing_state
    set credit_balance = credit_balance + p_amount,
        updated_at = now()
    where user_id = lower(trim(p_user_id))
    returning credit_balance into v_balance;

  insert into credit_ledger(user_id, job_id, stripe_event_id, entry_type, credits_delta, balance_after, reason, source_key)
  values (lower(trim(p_user_id)), p_job_id, p_stripe_event_id, 'grant', p_amount, v_balance, p_reason, p_source_key);

  return query select v_balance;
end;
$$;

create or replace function app_refund_job_credit_once(
  p_job_id uuid,
  p_reason text,
  p_source_key text
)
returns table(refunded boolean, balance integer)
language plpgsql
as $$
declare
  v_user_id text;
  v_debit integer;
  v_balance integer;
begin
  update try_on_jobs
     set credit_refund_issued = true,
         updated_at = now()
   where id = p_job_id
     and coalesce(credit_refund_issued, false) = false
     and coalesce(credit_cost_debited, 0) > 0
   returning user_id, credit_cost_debited into v_user_id, v_debit;

  if v_user_id is null then
    return query select false, null::integer;
    return;
  end if;

  update user_billing_state
    set credit_balance = credit_balance + v_debit,
        updated_at = now()
    where user_id = v_user_id
    returning credit_balance into v_balance;

  insert into credit_ledger(user_id, job_id, entry_type, credits_delta, balance_after, reason, source_key)
  values (v_user_id, p_job_id, 'refund', v_debit, v_balance, p_reason, p_source_key);

  return query select true, v_balance;
end;
$$;

