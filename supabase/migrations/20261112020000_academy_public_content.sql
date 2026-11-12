-- Editable academy content for the public landing page. No seed/sample data is added.
alter table public.academy_settings
  add column if not exists subjects text[] not null default '{}',
  add column if not exists teaching_methodology text not null default '',
  add column if not exists academy_features text[] not null default '{}',
  add column if not exists online_class_steps text[] not null default '{}';
