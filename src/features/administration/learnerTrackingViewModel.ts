/**
 * Table de suivi CROISÉE des apprenants (MAQUETTE DÉTERMINISTE).
 *
 * Une seule dérivation, partagée par « Classes d'apprenants », « Pilotage de
 * programme » et « Base de connaissances », afin que tous les onglets montrent
 * exactement les mêmes chiffres pour une promotion donnée.
 *
 * Quatre axes croisés par apprenant :
 *  - bases théoriques  : objectifs de nature « connaissance »
 *  - compétences       : simulées + réelles (validation tierce obligatoire)
 *  - stage             : carnets attendus / déposés / validés
 *  - évaluations       : épreuves configurées du programme
 *
 * Les axes théorie et évaluations n'ont pas encore de source réelle : ils sont
 * dérivés d'un hachage stable (inscription × élément) — jamais aléatoires, mais
 * explicitement présentés comme simulés dans l'interface.
 */
import type { AssessmentDefinition } from "@/domain/assessment";
import type { StageLog } from "@/domain/stageLog";
import type { Enrollment, Outcome, Person } from "@/domain/types";
import {
  buildLearnerCompetenceRows,
  simulatedCompetenceState,
} from "@/features/administration/competenceTrackingViewModel";

export type TrackingAxis = "theory" | "competence" | "placement" | "assessment";

export const TRACKING_AXIS_LABELS_FR: Record<TrackingAxis, string> = {
  theory: "Bases théoriques",
  competence: "Compétences",
  placement: "Stage",
  assessment: "Évaluations",
};

export const TRACKING_AXIS_HINTS_FR: Record<TrackingAxis, string> = {
  theory: "Objectifs de connaissance acquis (simulé).",
  competence: "Compétences validées par un tiers (simulé).",
  placement: "Carnets de stage validés sur carnets attendus.",
  assessment: "Épreuves réussies sur épreuves configurées (simulé).",
};

/** Hachage stable, identique à celui du suivi des compétences. */
function stableHash(seed: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash);
}

export interface AxisScore {
  readonly done: number;
  readonly total: number;
  readonly percent: number;
}

function score(done: number, total: number): AxisScore {
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export interface LearnerTrackingRow {
  readonly enrollmentId: string;
  readonly cohortId: string;
  readonly personName: string;
  readonly status: Enrollment["status"];
  readonly theory: AxisScore;
  readonly competence: AxisScore;
  readonly placement: AxisScore;
  readonly assessment: AxisScore;
  /** Moyenne des axes qui ont au moins un élément attendu. */
  readonly globalPercent: number;
  /** Compétences déclarées par l'apprenant, en attente de validation humaine. */
  readonly awaitingValidation: number;
}

function theoryScore(enrollmentId: string, outcomes: readonly Outcome[]): AxisScore {
  const knowledge = outcomes.filter((o) => o.nature === "knowledge");
  const done = knowledge.filter(
    (o) => stableHash(`theory::${enrollmentId}::${o.id}`) % 10 < 6,
  ).length;
  return score(done, knowledge.length);
}

function assessmentScore(
  enrollmentId: string,
  assessments: readonly AssessmentDefinition[],
): AxisScore {
  const done = assessments.filter(
    (a) => stableHash(`assessment::${enrollmentId}::${a.id}`) % 10 < 7,
  ).length;
  return score(done, assessments.length);
}

function placementScore(
  enrollmentId: string,
  logs: readonly StageLog[],
  expectedLogs: number,
): AxisScore {
  const own = logs.filter((l) => l.enrollmentId === enrollmentId);
  const validated = own.filter(
    (l) =>
      l.status === "validated" ||
      l.status === "transmitted" ||
      l.validations.some((v) => v.decision === "validated"),
  ).length;
  return score(validated, Math.max(expectedLogs, own.length));
}

export function buildLearnerTrackingRows(input: {
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly outcomes: readonly Outcome[];
  readonly logs: readonly StageLog[];
  readonly assessments: readonly AssessmentDefinition[];
  readonly expectedLogsPerLearner: number;
}): readonly LearnerTrackingRow[] {
  const competenceRows = new Map(
    buildLearnerCompetenceRows(input.enrollments, input.outcomes).map((r) => [r.enrollmentId, r]),
  );

  return input.enrollments
    .map((enrollment) => {
      const competenceRow = competenceRows.get(enrollment.id);
      const theory = theoryScore(enrollment.id, input.outcomes);
      const competence = score(competenceRow?.validated ?? 0, competenceRow?.total ?? 0);
      const placement = placementScore(enrollment.id, input.logs, input.expectedLogsPerLearner);
      const assessment = assessmentScore(enrollment.id, input.assessments);
      const active = [theory, competence, placement, assessment].filter((a) => a.total > 0);
      return {
        enrollmentId: enrollment.id,
        cohortId: enrollment.cohortId,
        personName:
          input.people.find((p) => p.id === enrollment.personId)?.fullName ?? "Apprenant",
        status: enrollment.status,
        theory,
        competence,
        placement,
        assessment,
        globalPercent:
          active.length === 0
            ? 0
            : Math.round(active.reduce((sum, a) => sum + a.percent, 0) / active.length),
        awaitingValidation: competenceRow?.declared ?? 0,
      };
    })
    .sort((a, b) => a.personName.localeCompare(b.personName, "fr"));
}

export interface TrackingSummary {
  readonly learners: number;
  readonly theoryPercent: number;
  readonly competencePercent: number;
  readonly placementPercent: number;
  readonly assessmentPercent: number;
  readonly globalPercent: number;
  readonly awaitingValidation: number;
  /** Apprenants dont un axe attendu reste à 0 %. */
  readonly blockedLearners: number;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

export function summarizeLearnerTracking(rows: readonly LearnerTrackingRow[]): TrackingSummary {
  return {
    learners: rows.length,
    theoryPercent: mean(rows.map((r) => r.theory.percent)),
    competencePercent: mean(rows.map((r) => r.competence.percent)),
    placementPercent: mean(rows.map((r) => r.placement.percent)),
    assessmentPercent: mean(rows.map((r) => r.assessment.percent)),
    globalPercent: mean(rows.map((r) => r.globalPercent)),
    awaitingValidation: rows.reduce((n, r) => n + r.awaitingValidation, 0),
    blockedLearners: rows.filter((r) =>
      [r.theory, r.competence, r.placement, r.assessment].some(
        (axis) => axis.total > 0 && axis.percent === 0,
      ),
    ).length,
  };
}

/** Réexport pratique : l'état nominatif d'une compétence reste la même règle. */
export { simulatedCompetenceState };
