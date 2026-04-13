-- New users created via billing RPCs get 3 free credits by default (aligned with app + TRY_ON_DEFAULT_USER_CREDITS).
-- Does not modify existing user_billing_state rows.

create or replace function app_ensure_user_billing_row(p_user_id text, p_default_credits integer default 3)
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
  p_default_credits integer default 3
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
  p_default_credits integer default 3
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
