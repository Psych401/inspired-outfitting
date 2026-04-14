-- Supabase Auth + UUID ownership migration.
-- Moves app ownership from email/text user ids to auth.users UUID ids.

create extension if not exists pgcrypto;

-- 1) Profiles table linked to auth.users (app-specific user data).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into profiles (id, email, full_name, avatar_url)
select
  u.id,
  lower(u.email),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, profiles.full_name),
  avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
  updated_at = now();

alter table if exists app_users add column if not exists migrated_user_id uuid;

update app_users au
set migrated_user_id = p.id
from profiles p
where lower(au.email) = lower(p.email);

-- Archive any legacy rows that cannot be mapped to auth.users by email, then continue.
create table if not exists legacy_unmigrated_app_users (
  id text primary key,
  email text,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz not null default now(),
  archive_reason text not null default 'no_matching_auth_user_email'
);

insert into legacy_unmigrated_app_users (id, email, created_at, updated_at)
select au.id, au.email, au.created_at, au.updated_at
from app_users au
where au.migrated_user_id is null
on conflict (id) do nothing;

create table if not exists legacy_unmigrated_user_billing_state as
select * from user_billing_state where false;
alter table legacy_unmigrated_user_billing_state add column if not exists archived_at timestamptz not null default now();
alter table legacy_unmigrated_user_billing_state add column if not exists archive_reason text not null default 'no_matching_auth_user_email';
insert into legacy_unmigrated_user_billing_state
select ubs.*, now(), 'no_matching_auth_user_email'
from user_billing_state ubs
join app_users au on au.id = ubs.user_id
where au.migrated_user_id is null;

create table if not exists legacy_unmigrated_try_on_jobs as
select * from try_on_jobs where false;
alter table legacy_unmigrated_try_on_jobs add column if not exists archived_at timestamptz not null default now();
alter table legacy_unmigrated_try_on_jobs add column if not exists archive_reason text not null default 'no_matching_auth_user_email';
insert into legacy_unmigrated_try_on_jobs
select j.*, now(), 'no_matching_auth_user_email'
from try_on_jobs j
join app_users au on au.id = j.user_id
where au.migrated_user_id is null;

create table if not exists legacy_unmigrated_user_images as
select * from user_images where false;
alter table legacy_unmigrated_user_images add column if not exists archived_at timestamptz not null default now();
alter table legacy_unmigrated_user_images add column if not exists archive_reason text not null default 'no_matching_auth_user_email';
insert into legacy_unmigrated_user_images
select i.*, now(), 'no_matching_auth_user_email'
from user_images i
join app_users au on au.id = i.user_id
where au.migrated_user_id is null;

create table if not exists legacy_unmigrated_credit_ledger as
select * from credit_ledger where false;
alter table legacy_unmigrated_credit_ledger add column if not exists archived_at timestamptz not null default now();
alter table legacy_unmigrated_credit_ledger add column if not exists archive_reason text not null default 'no_matching_auth_user_email';
insert into legacy_unmigrated_credit_ledger
select l.*, now(), 'no_matching_auth_user_email'
from credit_ledger l
join app_users au on au.id = l.user_id
where au.migrated_user_id is null;

delete from credit_ledger l
using app_users au
where au.id = l.user_id and au.migrated_user_id is null;

delete from user_images i
using app_users au
where au.id = i.user_id and au.migrated_user_id is null;

delete from try_on_jobs j
using app_users au
where au.id = j.user_id and au.migrated_user_id is null;

delete from user_billing_state ubs
using app_users au
where au.id = ubs.user_id and au.migrated_user_id is null;

do $$
declare
  archived_count integer;
begin
  select count(*) into archived_count from legacy_unmigrated_app_users;
  if archived_count > 0 then
    raise notice 'Archived % legacy users without matching auth.users emails into legacy_unmigrated_* tables.', archived_count;
  end if;
end
$$;

create table if not exists app_users_new (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app_users_new (id, email, created_at, updated_at)
select migrated_user_id, lower(email), created_at, updated_at
from app_users
where migrated_user_id is not null
on conflict (id) do update
set email = excluded.email, updated_at = now();

create table if not exists user_billing_state_new (
  user_id uuid primary key references app_users_new(id) on delete cascade,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  subscription_tier text not null default 'none',
  subscription_status text not null default 'none',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into user_billing_state_new (
  user_id, credit_balance, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, updated_at
)
select
  au.migrated_user_id,
  ubs.credit_balance,
  ubs.subscription_tier,
  ubs.subscription_status,
  ubs.stripe_customer_id,
  ubs.stripe_subscription_id,
  ubs.created_at,
  ubs.updated_at
from user_billing_state ubs
join app_users au on au.id = ubs.user_id
on conflict (user_id) do update
set
  credit_balance = excluded.credit_balance,
  subscription_tier = excluded.subscription_tier,
  subscription_status = excluded.subscription_status,
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_subscription_id = excluded.stripe_subscription_id,
  updated_at = now();

alter table try_on_jobs add column if not exists user_id_uuid uuid;
update try_on_jobs j
set user_id_uuid = au.migrated_user_id
from app_users au
where au.id = j.user_id;

alter table user_images add column if not exists user_id_uuid uuid;
update user_images i
set user_id_uuid = au.migrated_user_id
from app_users au
where au.id = i.user_id;

alter table credit_ledger add column if not exists user_id_uuid uuid;
update credit_ledger l
set user_id_uuid = au.migrated_user_id
from app_users au
where au.id = l.user_id;

alter table try_on_jobs alter column user_id_uuid set not null;
alter table user_images alter column user_id_uuid set not null;
alter table credit_ledger alter column user_id_uuid set not null;

alter table if exists try_on_jobs drop constraint if exists try_on_jobs_user_id_fkey;
alter table if exists user_images drop constraint if exists user_images_user_id_fkey;
alter table if exists credit_ledger drop constraint if exists credit_ledger_user_id_fkey;
alter table if exists user_billing_state drop constraint if exists user_billing_state_user_id_fkey;

alter table try_on_jobs drop column user_id;
alter table user_images drop column user_id;
alter table credit_ledger drop column user_id;

alter table try_on_jobs rename column user_id_uuid to user_id;
alter table user_images rename column user_id_uuid to user_id;
alter table credit_ledger rename column user_id_uuid to user_id;

drop table if exists user_billing_state;
drop table if exists app_users;

alter table app_users_new rename to app_users;
alter table user_billing_state_new rename to user_billing_state;

alter table try_on_jobs
  add constraint try_on_jobs_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;
alter table user_images
  add constraint user_images_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;
alter table credit_ledger
  add constraint credit_ledger_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

create or replace function app_ensure_user_billing_row(p_user_id uuid, p_default_credits integer default 3, p_email text default null)
returns void language plpgsql as $$
begin
  insert into app_users(id, email)
  values (p_user_id, coalesce(lower(trim(p_email)), lower(trim(p_user_id::text))))
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into user_billing_state(user_id, credit_balance, subscription_tier, subscription_status)
  values (p_user_id, p_default_credits, 'none', 'none')
  on conflict (user_id) do nothing;
end;
$$;

create or replace function app_debit_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_job_id uuid default null,
  p_source_key text default null,
  p_default_credits integer default 3,
  p_email text default null
)
returns table(ok boolean, balance integer)
language plpgsql
as $$
declare
  v_balance integer;
begin
  perform app_ensure_user_billing_row(p_user_id, p_default_credits, p_email);
  update user_billing_state
    set credit_balance = credit_balance - p_amount,
        updated_at = now()
    where user_id = p_user_id
      and credit_balance >= p_amount
    returning credit_balance into v_balance;

  if v_balance is null then
    select credit_balance into v_balance from user_billing_state where user_id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  insert into credit_ledger(user_id, job_id, entry_type, credits_delta, balance_after, reason, source_key)
  values (p_user_id, p_job_id, 'debit', -p_amount, v_balance, p_reason, p_source_key);

  return query select true, v_balance;
end;
$$;

create or replace function app_grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_source_key text default null,
  p_job_id uuid default null,
  p_stripe_event_id text default null,
  p_default_credits integer default 3,
  p_email text default null
)
returns table(balance integer)
language plpgsql
as $$
declare
  v_balance integer;
begin
  perform app_ensure_user_billing_row(p_user_id, p_default_credits, p_email);

  update user_billing_state
    set credit_balance = credit_balance + p_amount,
        updated_at = now()
    where user_id = p_user_id
    returning credit_balance into v_balance;

  insert into credit_ledger(user_id, job_id, stripe_event_id, entry_type, credits_delta, balance_after, reason, source_key)
  values (p_user_id, p_job_id, p_stripe_event_id, 'grant', p_amount, v_balance, p_reason, p_source_key);

  return query select v_balance;
end;
$$;

alter table profiles enable row level security;
drop policy if exists profiles_self_read on profiles;
drop policy if exists profiles_self_write on profiles;
create policy profiles_self_read on profiles for select using (auth.uid() = id);
create policy profiles_self_write on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
