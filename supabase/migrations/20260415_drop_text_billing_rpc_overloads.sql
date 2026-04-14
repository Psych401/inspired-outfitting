-- Remove legacy text-typed overloads of billing RPCs. They coexisted with uuid versions from
-- 20260414_auth_uuid_profiles_migration.sql, which made PostgREST unable to resolve
-- app_grant_credits / app_debit_credits / app_ensure_user_billing_row (ambiguous text vs uuid).
-- Canonical signatures are uuid-only (see same migration file).

drop function if exists public.app_ensure_user_billing_row(text, integer);
drop function if exists public.app_debit_credits(text, integer, text, uuid, text, integer);
drop function if exists public.app_grant_credits(text, integer, text, text, uuid, text, integer);

-- try_on_jobs.user_id is uuid; keep refund helper aligned (was text variable).
create or replace function app_refund_job_credit_once(
  p_job_id uuid,
  p_reason text,
  p_source_key text
)
returns table(refunded boolean, balance integer)
language plpgsql
as $$
declare
  v_user_id uuid;
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
