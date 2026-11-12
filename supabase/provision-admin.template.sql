-- Run only after the intended owner has registered and verified their account.
-- Replace the placeholder privately in Supabase SQL Editor. Do not commit an email or password here.
update public.profiles
set role = 'admin', status = 'active'
where id = (
  select id from auth.users
  where lower(email) = lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
    and email_confirmed_at is not null
);

-- Confirm exactly one intended owner was promoted before leaving the SQL Editor.
select id, email, role, status
from public.profiles
where role = 'admin';
