-- Students may submit only to active classes before the deadline.
-- They may revise only when a teacher explicitly requests a revision.
drop policy if exists submissions_create_own on public.homework_submissions;
create policy submissions_create_own on public.homework_submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'submitted'
    and teacher_feedback is null
    and marks is null
    and reviewed_at is null
    and exists (
      select 1 from public.homework h
      join public.class_enrollments e on e.class_id = h.class_id
      where h.id = homework_submissions.homework_id
        and h.status = 'published'
        and (h.due_at is null or h.due_at > now())
        and e.student_id = (select auth.uid())
        and e.status = 'active'
    )
  );

create or replace function public.protect_submission_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_academy_admin() then
    if new.status is distinct from old.status
      or new.teacher_feedback is distinct from old.teacher_feedback
      or new.marks is distinct from old.marks
      or new.reviewed_at is distinct from old.reviewed_at
      or new.student_id is distinct from old.student_id
      or new.homework_id is distinct from old.homework_id then
      raise exception 'Only an academy administrator can review a submission';
    end if;

    if (new.answer_text is distinct from old.answer_text or new.answer_url is distinct from old.answer_url)
      and not (
        old.status = 'needs_revision'
        or (old.status = 'submitted' and exists (
          select 1 from public.homework h
          where h.id = old.homework_id
            and h.status = 'published'
            and (h.due_at is null or h.due_at > now())
        ))
      ) then
      raise exception 'This submission can no longer be changed';
    end if;
  end if;
  return new;
end;
$$;
