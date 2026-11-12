-- Extend the existing, participant-protected call records for Daily.co,
-- call history, usage reporting and opt-in incoming-call push notifications.
-- No academy users, calls, or subscriptions are seeded.

alter table public.academy_video_calls
  drop constraint if exists academy_video_calls_status_check;

alter table public.academy_video_calls
  add constraint academy_video_calls_status_check
    check (status in ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed')),
  add column if not exists provider text not null default 'daily',
  add column if not exists daily_room_name text,
  add column if not exists started_at timestamptz,
  add column if not exists duration_seconds integer not null default 0;

create unique index if not exists academy_video_calls_daily_room_unique
  on public.academy_video_calls (daily_room_name)
  where daily_room_name is not null;

create table if not exists public.academy_call_settings (
  id smallint primary key default 1 check (id = 1),
  monthly_participant_minutes_limit integer not null default 10000 check (monthly_participant_minutes_limit > 0),
  updated_at timestamptz not null default now()
);
insert into public.academy_call_settings (id) values (1) on conflict (id) do nothing;
alter table public.academy_call_settings enable row level security;
revoke all on public.academy_call_settings from anon, authenticated;
grant select, update on public.academy_call_settings to authenticated;
drop policy if exists academy_call_settings_admin_only on public.academy_call_settings;
create policy academy_call_settings_admin_only on public.academy_call_settings
  for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_self_manage on public.push_subscriptions;
create policy push_subscriptions_self_manage on public.push_subscriptions
  for all to authenticated using (user_id = (select auth.uid()) and public.is_active_academy_call_member())
  with check (user_id = (select auth.uid()) and public.is_active_academy_call_member());

create or replace function public.get_academy_call_history(p_limit integer default 50)
returns table (
  id uuid, caller_id uuid, callee_id uuid, caller_name text, callee_name text,
  call_type text, status text, created_at timestamptz, answered_at timestamptz,
  ended_at timestamptz, duration_seconds integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.caller_id, c.callee_id,
         coalesce(nullif(btrim(caller.full_name), ''), 'Academy member'),
         coalesce(nullif(btrim(callee.full_name), ''), 'Academy member'),
         c.media_mode,
         case when c.status = 'ringing' and c.expires_at <= now() then 'missed' else c.status end,
         c.created_at, c.answered_at, c.ended_at, c.duration_seconds
    from public.academy_video_calls c
    join public.profiles caller on caller.id = c.caller_id
    join public.profiles callee on callee.id = c.callee_id
   where c.caller_id = (select auth.uid()) or c.callee_id = (select auth.uid())
   order by c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.academy_call_month_used_seconds()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    case when c.status = 'accepted' and c.started_at is not null
      then greatest(0, floor(extract(epoch from (now() - greatest(c.started_at, date_trunc('month', now())))))::bigint)
      else greatest(0, c.duration_seconds)::bigint
    end
  ), 0)::bigint
  from public.academy_video_calls c
  where (c.status = 'accepted' and c.started_at >= date_trunc('month', now()))
     or (c.status in ('ended', 'failed') and c.ended_at >= date_trunc('month', now()));
$$;

create or replace function public.get_academy_call_usage()
returns table (participant_minutes bigint, monthly_limit integer, month_started_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.academy_call_month_used_seconds() / 30,
         s.monthly_participant_minutes_limit,
         date_trunc('month', now())
    from public.academy_call_settings s
   where s.id = 1 and public.is_academy_admin();
$$;

revoke all on function public.academy_call_month_used_seconds() from public, anon, authenticated;

create or replace function public.create_academy_video_call(p_recipient_id uuid, p_media_mode text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := (select auth.uid());
  v_caller_role text;
  v_caller_status text;
  v_recipient_role text;
  v_recipient_status text;
  v_call_id uuid;
  v_monthly_limit integer;
begin
  if v_caller is null or p_recipient_id is null or p_recipient_id = v_caller or p_media_mode is null or p_media_mode not in ('audio', 'video') then
    raise exception 'Invalid call recipient.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id in (v_caller, p_recipient_id) order by id for update;
  select role, status into v_caller_role, v_caller_status from public.profiles where id = v_caller;
  select role, status into v_recipient_role, v_recipient_status from public.profiles where id = p_recipient_id;
  if v_caller_status is distinct from 'active' or v_caller_role not in ('admin', 'student') then raise exception 'Your academy account is not active.' using errcode = '42501'; end if;
  if v_recipient_status is distinct from 'active' or v_recipient_role not in ('admin', 'student') then raise exception 'This account is not available for calls.' using errcode = '42501'; end if;
  if not ((v_caller_role = 'admin' and v_recipient_role = 'student') or (v_caller_role = 'student' and v_recipient_role = 'admin')) then
    raise exception 'Calls are available between academy administrators and students.' using errcode = '42501';
  end if;
  if exists (select 1 from public.academy_video_calls c where c.status in ('accepted', 'ringing') and c.expires_at > now()
      and (c.caller_id in (v_caller, p_recipient_id) or c.callee_id in (v_caller, p_recipient_id))) then
    raise exception 'One of these users is already in a call.' using errcode = '55000';
  end if;
  select monthly_participant_minutes_limit into v_monthly_limit from public.academy_call_settings where id = 1;
  if public.academy_call_month_used_seconds() >= v_monthly_limit::bigint * 30 then
    raise exception 'The academy monthly calling limit has been reached.' using errcode = '54000';
  end if;
  insert into public.academy_video_calls (caller_id, callee_id, media_mode, provider)
  values (v_caller, p_recipient_id, p_media_mode, 'daily') returning id into v_call_id;
  return v_call_id;
end;
$$;
grant execute on function public.create_academy_video_call(uuid, text) to authenticated;

create or replace function public.set_academy_call_monthly_limit(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_academy_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if p_limit < 1 or p_limit > 10000000 then raise exception 'Monthly limit must be between 1 and 10000000.' using errcode = '22023'; end if;
  update public.academy_call_settings set monthly_participant_minutes_limit = p_limit, updated_at = now() where id = 1;
  return p_limit;
end;
$$;

create or replace function public.respond_to_academy_video_call(p_call_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required.' using errcode = '42501'; end if;
  update public.academy_video_calls
     set status = case when p_accept then 'accepted' else 'rejected' end,
         answered_at = case when p_accept then now() else null end,
         started_at = case when p_accept then now() else null end,
         expires_at = case when p_accept then now() + interval '3 hours' else expires_at end,
         ended_at = case when p_accept then null else now() end
   where id = p_call_id and callee_id = (select auth.uid()) and status = 'ringing' and expires_at > now();
  return found;
end;
$$;

create or replace function public.finish_academy_video_call(p_call_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required.' using errcode = '42501'; end if;
  update public.academy_video_calls
     set status = case when caller_id = (select auth.uid()) and status = 'ringing' then 'missed' else 'ended' end,
         ended_at = now(),
         duration_seconds = case when started_at is not null then greatest(0, floor(extract(epoch from (now() - started_at)))::integer) else 0 end
   where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid())) and status in ('ringing', 'accepted');
  select status into v_status from public.academy_video_calls
   where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));
  return v_status;
end;
$$;

create or replace function public.fail_academy_video_call(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required.' using errcode = '42501'; end if;
  update public.academy_video_calls
     set status = 'failed', ended_at = now(),
         duration_seconds = case when started_at is not null then greatest(0, floor(extract(epoch from (now() - started_at)))::integer) else 0 end
   where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid())) and status in ('ringing', 'accepted');
  return found;
end;
$$;

create or replace function public.keep_academy_video_call_alive(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_limit integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required.' using errcode = '42501'; end if;
  select monthly_participant_minutes_limit into v_limit from public.academy_call_settings where id = 1;
  if public.academy_call_month_used_seconds() >= v_limit::bigint * 30 then
    update public.academy_video_calls set status = 'ended', ended_at = now(),
      duration_seconds = greatest(0, floor(extract(epoch from (now() - started_at)))::integer)
     where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid())) and status = 'accepted';
    return false;
  end if;
  update public.academy_video_calls set expires_at = now() + interval '60 seconds'
   where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid())) and status = 'accepted' and expires_at > now();
  return found;
end;
$$;

revoke all on function public.get_academy_call_history(integer) from public, anon;
revoke all on function public.get_academy_call_usage() from public, anon;
revoke all on function public.set_academy_call_monthly_limit(integer) from public, anon;
revoke all on function public.fail_academy_video_call(uuid) from public, anon;
revoke all on function public.keep_academy_video_call_alive(uuid) from public, anon;
grant execute on function public.get_academy_call_history(integer) to authenticated;
grant execute on function public.get_academy_call_usage() to authenticated;
grant execute on function public.set_academy_call_monthly_limit(integer) to authenticated;
grant execute on function public.respond_to_academy_video_call(uuid, boolean) to authenticated;
grant execute on function public.finish_academy_video_call(uuid) to authenticated;
grant execute on function public.fail_academy_video_call(uuid) to authenticated;
grant execute on function public.keep_academy_video_call_alive(uuid) to authenticated;

drop policy if exists academy_call_presence_read on realtime.messages;
create policy academy_call_presence_read on realtime.messages
  for select to authenticated using (extension = 'presence' and realtime.topic() = 'academy-call-presence' and public.is_active_academy_call_member());
drop policy if exists academy_call_presence_track on realtime.messages;
create policy academy_call_presence_track on realtime.messages
  for insert to authenticated with check (extension = 'presence' and realtime.topic() = 'academy-call-presence' and public.is_active_academy_call_member());
