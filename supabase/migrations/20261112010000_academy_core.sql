-- Core schema for Almuafy Online Academy.
-- This migration intentionally contains no student, class, attendance, or notice seed records.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  photo_url text,
  gender text check (gender is null or gender in ('female', 'male', 'unspecified')),
  address text,
  role text not null default 'student' check (role in ('student', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_academy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_academy_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status or new.email is distinct from old.email then
      raise exception 'Only an academy administrator can change profile privileges or status';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when excluded.full_name <> '' then excluded.full_name else profiles.full_name end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

create table if not exists public.academy_settings (
  id smallint primary key default 1 check (id = 1),
  academy_name text not null default 'আলমুয়াফী অনলাইন একাডেমি',
  description text not null default '',
  teacher_name text not null default '',
  teacher_bio text not null default '',
  teacher_photo_url text,
  qualifications text[] not null default '{}',
  teaching_experience text not null default '',
  contact_email text,
  contact_phone text,
  social_links jsonb not null default '{}'::jsonb,
  footer_text text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  public_visible boolean not null default false,
  level text not null default '',
  description text not null default '',
  teacher_id uuid references public.profiles(id) on delete set null,
  schedule jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.classes add column if not exists public_visible boolean not null default false;

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'pending', 'inactive')),
  enrolled_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes between 1 and 600),
  meeting_url text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late')),
  note text not null default '',
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.library_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.library_resources (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.library_categories(id) on delete set null,
  title text not null,
  description text not null default '',
  resource_url text not null check (resource_url ~* '^https?://'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  subject text not null,
  description text not null default '',
  lesson_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_links (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.daily_lessons(id) on delete cascade,
  label text not null,
  url text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now()
);

create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text not null default '',
  answer_url text check (answer_url is null or answer_url ~* '^https?://'),
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'completed', 'needs_revision')),
  teacher_feedback text,
  marks numeric(6,2) check (marks is null or marks between 0 and 100),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (homework_id, student_id)
);

create or replace function public.protect_submission_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_academy_admin() and (
    new.status is distinct from old.status or
    new.teacher_feedback is distinct from old.teacher_feedback or
    new.marks is distinct from old.marks or
    new.reviewed_at is distinct from old.reviewed_at or
    new.student_id is distinct from old.student_id or
    new.homework_id is distinct from old.homework_id
  ) then
    raise exception 'Students cannot change review fields';
  end if;
  return new;
end;
$$;

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  published_at timestamptz,
  expires_at timestamptz,
  visibility text not null default 'students' check (visibility in ('public', 'students', 'all_users')),
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  kind text not null default 'general',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.protect_notification_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_academy_admin() and (
    new.user_id is distinct from old.user_id or
    new.title is distinct from old.title or
    new.body is distinct from old.body or
    new.kind is distinct from old.kind or
    new.href is distinct from old.href or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'Only the read state can be changed by a student';
  end if;
  return new;
end;
$$;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists class_enrollments_student_idx on public.class_enrollments(student_id, status);
create index if not exists class_sessions_class_starts_idx on public.class_sessions(class_id, starts_at);
create index if not exists attendance_student_recorded_idx on public.attendance(student_id, recorded_at desc);
create index if not exists library_resources_category_status_idx on public.library_resources(category_id, status);
create index if not exists daily_lessons_class_date_idx on public.daily_lessons(class_id, lesson_date desc);
create index if not exists homework_class_due_idx on public.homework(class_id, due_at);
create index if not exists homework_submissions_student_idx on public.homework_submissions(student_id, submitted_at desc);
create index if not exists notices_status_publish_idx on public.notices(status, published_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','classes','class_sessions','library_resources','daily_lessons','homework','notices'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles
  for each row execute function public.protect_profile_privileges();
drop trigger if exists protect_submission_review_fields on public.homework_submissions;
create trigger protect_submission_review_fields before update on public.homework_submissions
  for each row execute function public.protect_submission_review_fields();
drop trigger if exists protect_notification_content on public.notifications;
create trigger protect_notification_content before update on public.notifications
  for each row execute function public.protect_notification_content();

alter table public.profiles enable row level security;
alter table public.academy_settings enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.library_categories enable row level security;
alter table public.library_resources enable row level security;
alter table public.daily_lessons enable row level security;
alter table public.lesson_links enable row level security;
alter table public.homework enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.notices enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_academy_admin())
  with check (id = (select auth.uid()) or public.is_academy_admin());

drop policy if exists settings_read_public on public.academy_settings;
create policy settings_read_public on public.academy_settings for select to anon, authenticated using (true);
drop policy if exists settings_admin_manage on public.academy_settings;
create policy settings_admin_manage on public.academy_settings for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists classes_read_enrolled_or_admin on public.classes;
create policy classes_read_enrolled_or_admin on public.classes for select to authenticated
  using (public.is_academy_admin() or exists (
    select 1 from public.class_enrollments e where e.class_id = classes.id and e.student_id = (select auth.uid()) and e.status = 'active'
  ));
drop policy if exists classes_read_public on public.classes;
create policy classes_read_public on public.classes for select to anon, authenticated
  using (public_visible = true and status = 'active');
drop policy if exists classes_admin_manage on public.classes;
create policy classes_admin_manage on public.classes for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists enrollments_read_self_or_admin on public.class_enrollments;
create policy enrollments_read_self_or_admin on public.class_enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists enrollments_admin_manage on public.class_enrollments;
create policy enrollments_admin_manage on public.class_enrollments for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists sessions_read_enrolled_or_admin on public.class_sessions;
create policy sessions_read_enrolled_or_admin on public.class_sessions for select to authenticated
  using (public.is_academy_admin() or exists (
    select 1 from public.class_enrollments e where e.class_id = class_sessions.class_id and e.student_id = (select auth.uid()) and e.status = 'active'
  ));
drop policy if exists sessions_admin_manage on public.class_sessions;
create policy sessions_admin_manage on public.class_sessions for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists attendance_read_self_or_admin on public.attendance;
create policy attendance_read_self_or_admin on public.attendance for select to authenticated
  using (student_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists attendance_admin_manage on public.attendance;
create policy attendance_admin_manage on public.attendance for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists categories_read_public on public.library_categories;
create policy categories_read_public on public.library_categories for select to anon, authenticated using (true);
drop policy if exists categories_admin_manage on public.library_categories;
create policy categories_admin_manage on public.library_categories for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists resources_read_published on public.library_resources;
create policy resources_read_published on public.library_resources for select to anon, authenticated
  using (status = 'published' or public.is_academy_admin());
drop policy if exists resources_admin_manage on public.library_resources;
create policy resources_admin_manage on public.library_resources for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists lessons_read_assigned_or_admin on public.daily_lessons;
create policy lessons_read_assigned_or_admin on public.daily_lessons for select to authenticated
  using (public.is_academy_admin() or (status = 'published' and exists (
    select 1 from public.class_enrollments e where e.class_id = daily_lessons.class_id and e.student_id = (select auth.uid()) and e.status = 'active'
  )));
drop policy if exists lessons_admin_manage on public.daily_lessons;
create policy lessons_admin_manage on public.daily_lessons for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists lesson_links_read_assigned_or_admin on public.lesson_links;
create policy lesson_links_read_assigned_or_admin on public.lesson_links for select to authenticated
  using (public.is_academy_admin() or exists (
    select 1 from public.daily_lessons l join public.class_enrollments e on e.class_id = l.class_id
    where l.id = lesson_links.lesson_id and l.status = 'published' and e.student_id = (select auth.uid()) and e.status = 'active'
  ));
drop policy if exists lesson_links_admin_manage on public.lesson_links;
create policy lesson_links_admin_manage on public.lesson_links for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists homework_read_assigned_or_admin on public.homework;
create policy homework_read_assigned_or_admin on public.homework for select to authenticated
  using (public.is_academy_admin() or (status = 'published' and exists (
    select 1 from public.class_enrollments e where e.class_id = homework.class_id and e.student_id = (select auth.uid()) and e.status = 'active'
  )));
drop policy if exists homework_admin_manage on public.homework;
create policy homework_admin_manage on public.homework for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists submissions_read_self_or_admin on public.homework_submissions;
create policy submissions_read_self_or_admin on public.homework_submissions for select to authenticated
  using (student_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists submissions_create_own on public.homework_submissions;
create policy submissions_create_own on public.homework_submissions for insert to authenticated
  with check (student_id = (select auth.uid()) and status = 'submitted' and teacher_feedback is null and marks is null and reviewed_at is null and exists (
    select 1 from public.homework h join public.class_enrollments e on e.class_id = h.class_id
    where h.id = homework_submissions.homework_id and h.status = 'published' and e.student_id = (select auth.uid()) and e.status = 'active'
  ));
drop policy if exists submissions_update_own_or_admin on public.homework_submissions;
create policy submissions_update_own_or_admin on public.homework_submissions for update to authenticated
  using (student_id = (select auth.uid()) or public.is_academy_admin())
  with check (student_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists submissions_admin_delete on public.homework_submissions;
create policy submissions_admin_delete on public.homework_submissions for delete to authenticated
  using (public.is_academy_admin());

drop policy if exists notices_read_published on public.notices;
create policy notices_read_published on public.notices for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()) and (
    visibility = 'public' or (auth.uid() is not null and visibility in ('students', 'all_users'))
  ));
drop policy if exists notices_admin_manage on public.notices;
create policy notices_admin_manage on public.notices for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists notifications_read_own_or_admin on public.notifications;
create policy notifications_read_own_or_admin on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists notifications_update_read_own_or_admin on public.notifications;
create policy notifications_update_read_own_or_admin on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) or public.is_academy_admin())
  with check (user_id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists notifications_admin_manage on public.notifications;
create policy notifications_admin_manage on public.notifications for all to authenticated
  using (public.is_academy_admin()) with check (public.is_academy_admin());

drop policy if exists activity_logs_admin_read on public.activity_logs;
create policy activity_logs_admin_read on public.activity_logs for select to authenticated using (public.is_academy_admin());
drop policy if exists activity_logs_admin_create on public.activity_logs;
create policy activity_logs_admin_create on public.activity_logs for insert to authenticated with check (public.is_academy_admin());

grant usage on schema public to anon, authenticated;
grant select on public.academy_settings, public.classes, public.library_categories, public.library_resources, public.notices to anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.academy_settings, public.classes, public.class_enrollments,
  public.class_sessions, public.attendance, public.library_categories, public.library_resources,
  public.daily_lessons, public.lesson_links, public.homework, public.homework_submissions,
  public.notices, public.notifications, public.activity_logs to authenticated;
grant select on public.classes, public.class_enrollments, public.class_sessions, public.attendance,
  public.daily_lessons, public.lesson_links, public.homework, public.homework_submissions,
  public.notifications, public.activity_logs to authenticated;
grant execute on function public.is_academy_admin() to anon, authenticated;

