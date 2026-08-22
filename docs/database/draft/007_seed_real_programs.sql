-- Campus Santé Augmenté — création des 3 programmes réels
--
-- ****************************************************************
-- APPLIQUÉ le 22/08/2026 sur Supabase dev (accord explicite de Stef,
-- dry-run BEGIN...ROLLBACK puis COMMIT). Voir décision D95 dans
-- docs/database/draft/decision_log.md.
-- ****************************************************************
--
-- S'ajoute au programme pilote générique "Campus Santé" (toujours présent,
-- inchangé) : les 3 vrais programmes visés dans un premier temps. Chaque
-- "kind" correspond à une valeur existante de l'enum program_kind (diu,
-- dfasm, dpc, other) : aucune modification de schéma, uniquement des
-- données.
--
-- dpc_enabled=true uniquement sur la ligne DPC-ODP2C : la contrainte
-- programs_dpc_kind_coherent existante impose (NOT dpc_enabled) OR
-- (kind = 'dpc'), donc ce flag ne peut être activé que sur le programme
-- dont kind = 'dpc'.

insert into public.programs (code, name, kind, institution, dpc_enabled)
values
  ('DFASM-CARDIO', 'DFASM Cardiologie', 'dfasm', 'Université de Bordeaux', false),
  ('DIU-ECHO', 'DIU d''Échocardiographie', 'diu', 'Université de Bordeaux', false),
  ('DPC-ODP2C', 'DPC', 'dpc', 'ODP2C', true);

-- Ids réels générés à l'application (relus en base après COMMIT) :
--   DFASM-CARDIO : 60b506e7-213e-438d-b8cb-a60aad77f2ec
--   DIU-ECHO     : 561a244e-b377-49c1-a93a-009f76aabccb
--   DPC-ODP2C    : 516f2721-d76f-4219-8646-d1f4bd4d8ccf
--
-- Chaque programme devra ensuite recevoir sa ligne dans
-- program_email_senders (006_program_email_senders.sql, table créée le
-- 22/08/2026, encore vide) une fois sa boîte OVH invitation@... créée.
