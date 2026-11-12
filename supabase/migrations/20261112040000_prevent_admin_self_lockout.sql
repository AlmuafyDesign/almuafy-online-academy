-- Keep administrator accounts out of the student workflow and prevent a signed-in
-- administrator from disabling or demoting their own account through profile updates.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if old.id = (select auth.uid())
      and old.role = 'admin'
      and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'Administrators cannot change their own role or account status';
    end if;

    if not public.is_academy_admin()
      and (new.role is distinct from old.role
        or new.status is distinct from old.status
        or new.email is distinct from old.email) then
      raise exception 'Only an academy administrator can change profile privileges or status';
    end if;
  end if;
  return new;
end;
$$;
