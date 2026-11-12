-- Authenticated one-to-one video/audio call invitations and private WebRTC signaling.
-- Media travels directly between browsers; this migration stores only call state.

create table if not exists public.academy_video_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  media_mode text not null default 'video' check (media_mode in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 seconds'),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint academy_video_calls_no_self_call check (caller_id <> callee_id)
);

create index if not exists academy_video_calls_caller_open_idx
  on public.academy_video_calls (caller_id, created_at desc)
  where status in ('ringing', 'accepted');
create index if not exists academy_video_calls_callee_open_idx
  on public.academy_video_calls (callee_id, created_at desc)
  where status in ('ringing', 'accepted');

alter table public.academy_video_calls enable row level security;
revoke all on public.academy_video_calls from anon, authenticated;
grant select on public.academy_video_calls to authenticated;

drop policy if exists academy_video_calls_participant_read on public.academy_video_calls;
create policy academy_video_calls_participant_read
  on public.academy_video_calls for select to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

create or replace function public.get_academy_video_call_contacts()
returns table (user_id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), case when p.role = 'admin' then 'Academy admin' else 'Student' end),
         p.role
    from public.profiles me
    join public.profiles p on p.status = 'active' and p.id <> me.id
   where me.id = (select auth.uid())
     and me.status = 'active'
     and ((me.role = 'admin' and p.role = 'student') or (me.role = 'student' and p.role = 'admin'))
   order by case when p.role = 'admin' then 0 else 1 end, btrim(p.full_name);
$$;

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
begin
  if v_caller is null or p_recipient_id is null or p_recipient_id = v_caller or p_media_mode is null or p_media_mode not in ('audio', 'video') then
    raise exception 'Invalid call recipient.' using errcode = '22023';
  end if;

  -- Lock both accounts in a stable order so simultaneous calls cannot occupy either user twice.
  perform 1 from public.profiles
   where id in (v_caller, p_recipient_id)
   order by id
   for update;

  select role, status into v_caller_role, v_caller_status
    from public.profiles where id = v_caller;
  select role, status into v_recipient_role, v_recipient_status
    from public.profiles where id = p_recipient_id;

  if v_caller_status is distinct from 'active' or v_caller_role not in ('admin', 'student') then
    raise exception 'Your academy account is not active.' using errcode = '42501';
  end if;
  if v_recipient_status is distinct from 'active' or v_recipient_role not in ('admin', 'student') then
    raise exception 'This account is not available for calls.' using errcode = '42501';
  end if;
  if not ((v_caller_role = 'admin' and v_recipient_role = 'student') or (v_caller_role = 'student' and v_recipient_role = 'admin')) then
    raise exception 'Calls are available between academy administrators and students.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.academy_video_calls c
    where ((c.status in ('accepted', 'ringing')) and c.expires_at > now())
      and (c.caller_id in (v_caller, p_recipient_id) or c.callee_id in (v_caller, p_recipient_id))
  ) then
    raise exception 'One of these users is already in a call.' using errcode = '55000';
  end if;

  insert into public.academy_video_calls (caller_id, callee_id, media_mode)
  values (v_caller, p_recipient_id, p_media_mode)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

create or replace function public.respond_to_academy_video_call(p_call_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required.' using errcode = '42501';
  end if;

  update public.academy_video_calls
     set status = case when p_accept then 'accepted' else 'rejected' end,
         answered_at = case when p_accept then now() else null end,
         expires_at = case when p_accept then now() + interval '60 seconds' else expires_at end,
         ended_at = case when p_accept then null else now() end
   where id = p_call_id
     and callee_id = (select auth.uid())
     and status = 'ringing'
     and expires_at > now();

  return found;
end;
$$;

create or replace function public.finish_academy_video_call(p_call_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required.' using errcode = '42501';
  end if;

  update public.academy_video_calls
     set status = case when caller_id = (select auth.uid()) and status = 'ringing' then 'missed' else 'ended' end,
         ended_at = now()
   where id = p_call_id
     and (caller_id = (select auth.uid()) or callee_id = (select auth.uid()))
     and status in ('ringing', 'accepted');

  select status into v_status from public.academy_video_calls
   where id = p_call_id and (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));
  return v_status;
end;
$$;

create or replace function public.keep_academy_video_call_alive(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required.' using errcode = '42501';
  end if;

  update public.academy_video_calls
     set expires_at = now() + interval '60 seconds'
   where id = p_call_id
     and (caller_id = (select auth.uid()) or callee_id = (select auth.uid()))
     and status = 'accepted'
     and expires_at > now();
  return found;
end;
$$;

create or replace function public.is_active_academy_call_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('admin', 'student')
  );
$$;

create or replace function public.can_access_academy_video_call_topic()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic text := (select realtime.topic());
  v_call_id uuid;
begin
  if v_topic !~ '^academy-call:[0-9a-fA-F-]{36}$' then return false; end if;
  begin
    v_call_id := split_part(v_topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.academy_video_calls c
    where c.id = v_call_id
      and (c.caller_id = (select auth.uid()) or c.callee_id = (select auth.uid()))
      and c.status in ('accepted', 'ringing')
      and c.expires_at > now()
  );
end;
$$;

create or replace function public.can_access_academy_call_alert()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic text := (select realtime.topic());
  v_recipient_id uuid;
begin
  if v_topic !~ '^academy-call-alerts:[0-9a-fA-F-]{36}$' then return false; end if;
  begin
    v_recipient_id := split_part(v_topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  return public.is_active_academy_call_member()
     and (
       v_recipient_id = (select auth.uid())
       or exists (
         select 1 from public.academy_video_calls c
         where c.callee_id = v_recipient_id
           and c.caller_id = (select auth.uid())
           and c.status = 'ringing'
           and c.expires_at > now()
       )
     );
end;
$$;

revoke all on function public.get_academy_video_call_contacts() from public, anon;
revoke all on function public.create_academy_video_call(uuid, text) from public, anon;
revoke all on function public.respond_to_academy_video_call(uuid, boolean) from public, anon;
revoke all on function public.finish_academy_video_call(uuid) from public, anon;
revoke all on function public.keep_academy_video_call_alive(uuid) from public, anon;
revoke all on function public.is_active_academy_call_member() from public, anon;
revoke all on function public.can_access_academy_video_call_topic() from public, anon;
revoke all on function public.can_access_academy_call_alert() from public, anon;
grant execute on function public.get_academy_video_call_contacts() to authenticated;
grant execute on function public.create_academy_video_call(uuid, text) to authenticated;
grant execute on function public.respond_to_academy_video_call(uuid, boolean) to authenticated;
grant execute on function public.finish_academy_video_call(uuid) to authenticated;
grant execute on function public.keep_academy_video_call_alive(uuid) to authenticated;
grant execute on function public.is_active_academy_call_member() to authenticated;
grant execute on function public.can_access_academy_video_call_topic() to authenticated;
grant execute on function public.can_access_academy_call_alert() to authenticated;

drop policy if exists academy_video_call_signals_read on realtime.messages;
create policy academy_video_call_signals_read
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (public.can_access_academy_video_call_topic() or public.can_access_academy_call_alert())
  );

drop policy if exists academy_video_call_signals_send on realtime.messages;
create policy academy_video_call_signals_send
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and (public.can_access_academy_video_call_topic() or public.can_access_academy_call_alert())
  );
