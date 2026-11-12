-- Optional English translations for real academy-authored public content.
-- Existing Bangla content is preserved and no sample rows are inserted.
alter table public.academy_settings
  add column if not exists academy_name_en text,
  add column if not exists description_en text,
  add column if not exists about_text text not null default '',
  add column if not exists about_text_en text not null default '',
  add column if not exists teaching_methodology_en text not null default '',
  add column if not exists subjects_en text[] not null default '{}',
  add column if not exists academy_features_en text[] not null default '{}',
  add column if not exists online_class_steps_en text[] not null default '{}',
  add column if not exists library_intro text not null default '',
  add column if not exists library_intro_en text not null default '',
  add column if not exists notices_intro text not null default '',
  add column if not exists notices_intro_en text not null default '',
  add column if not exists footer_text_en text not null default '';

alter table public.classes
  add column if not exists name_en text,
  add column if not exists subject_en text,
  add column if not exists level_en text,
  add column if not exists description_en text;

alter table public.library_resources
  add column if not exists title_en text,
  add column if not exists description_en text;

alter table public.notices
  add column if not exists title_en text,
  add column if not exists description_en text;
