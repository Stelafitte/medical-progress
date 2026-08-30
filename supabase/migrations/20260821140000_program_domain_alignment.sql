-- Alignement additif du programme SQL avec le contrat TypeScript ProgramConfig.

create type public.mastery_level as enum
  ('not_started', 'novice', 'intermediate', 'proficient', 'autonomous');

alter table public.programs
  add column annual_learner_estimate integer not null default 0
    check (annual_learner_estimate >= 0),
  add column simulation_enabled boolean not null default false,
  add column pre_post_tests_enabled boolean not null default false,
  add column sessions_enabled boolean not null default false,
  add column target_mastery public.mastery_level not null default 'proficient';

comment on column public.programs.target_mastery is
  'Niveau cible du programme, aligné sur src/domain/types.ts.';
