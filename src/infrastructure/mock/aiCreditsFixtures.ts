/**
 * Écritures de crédits IA de DÉMONSTRATION, par enseignement.
 *
 * Aucun appel IA réel, aucune mesure : ces objets en mémoire servent à valider
 * l'interface de comptabilité et les seuils budgétaires avant activation.
 */
import type { AiCreditActorRole, AiCreditBudget, AiCreditEntry } from "@/domain/aiCredits";
import { CREDIT_UNIT_COST_BY_TIER } from "@/domain/aiCredits";
import { plannedTierForMode, type ContentAiMode } from "@/domain/contentAi";

let counter = 0;

function entry(
  programId: string,
  curriculumVersionId: string,
  cohortId: string,
  mode: ContentAiMode,
  actorRole: AiCreditActorRole,
  occurredAt: string,
  units: number,
  mediaId?: string,
): AiCreditEntry {
  const tier = plannedTierForMode(mode);
  counter += 1;
  return {
    id: `aic-${String(counter).padStart(3, "0")}`,
    programId,
    curriculumVersionId,
    cohortId,
    mode,
    tier,
    actorRole,
    occurredAt,
    units,
    credits: CREDIT_UNIT_COST_BY_TIER[tier] * units,
    mediaId,
    meteringActivated: false,
  };
}

const diu = (
  mode: ContentAiMode,
  actor: AiCreditActorRole,
  month: string,
  units: number,
  mediaId?: string,
) => entry("prog-diu-echo", "cv-diu-2026", "coh-diu-2026", mode, actor, `${month}-12T09:00:00Z`, units, mediaId);

const dfasm = (
  mode: ContentAiMode,
  actor: AiCreditActorRole,
  month: string,
  units: number,
  mediaId?: string,
) =>
  entry(
    "prog-dfasm-cardio",
    "cv-dfasm-2026",
    "coh-dfasm-2026",
    mode,
    actor,
    `${month}-12T09:00:00Z`,
    units,
    mediaId,
  );

export const aiCreditEntries: readonly AiCreditEntry[] = [
  // DIU d'Échocardiographie : usage écrit majoritaire, vocal marginal.
  diu("ask", "learner", "2026-05", 320, "med-diu-pdf-coupes"),
  diu("generate_quiz", "learner", "2026-05", 140, "med-diu-qcm-valves"),
  diu("be_questioned", "learner", "2026-06", 210),
  diu("adaptive_review", "learner", "2026-06", 48),
  diu("guided_clinical_case", "learner", "2026-07", 32),
  diu("ask", "teacher", "2026-07", 60),
  diu("voice", "learner", "2026-07", 6),
  diu("ask", "supervisor", "2026-08", 25),

  // DFASM Cardiologie : vocal mis en avant (préparation ECOS).
  dfasm("ask", "learner", "2026-05", 180, "med-dfasm-web-referentiel-cv"),
  dfasm("guided_clinical_case", "learner", "2026-06", 64),
  dfasm("voice", "learner", "2026-06", 42),
  dfasm("voice", "learner", "2026-07", 55),
  dfasm("adaptive_review", "learner", "2026-07", 36),
  dfasm("be_questioned", "learner", "2026-08", 120),
  dfasm("ask", "teacher", "2026-08", 40),
];

export const aiCreditBudgets: readonly AiCreditBudget[] = [
  {
    programId: "prog-diu-echo",
    curriculumVersionId: "cv-diu-2026",
    periodLabel: "Année universitaire 2026-2027",
    allocatedCredits: 3000,
    warningRatio: 0.8,
    hardCapCredits: 3600,
    voiceAllowed: true,
    note: "Vocal disponible mais jamais lancé par défaut : maîtrise des coûts.",
  },
  {
    programId: "prog-dfasm-cardio",
    curriculumVersionId: "cv-dfasm-2026",
    periodLabel: "Année universitaire 2026-2027",
    allocatedCredits: 2200,
    warningRatio: 0.75,
    hardCapCredits: 2600,
    voiceAllowed: true,
    note: "Enveloppe vocale renforcée pour la préparation ECOS.",
  },
];
