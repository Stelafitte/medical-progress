/**
 * Table de suivi CROISÉE des apprenants — DONNÉES RÉELLES depuis le 21/09.
 *
 * ⚠️ CE QUI A CHANGÉ, ET POURQUOI. Jusqu'au 21/09 les axes théorie, compétences
 * et évaluations étaient INVENTÉS par un hachage stable. Stef a vu des
 * statistiques d'avancement pour une promotion entière dont personne ne s'était
 * encore connecté. Désormais :
 *  - théorie      : connaissances que l'étudiant a DÉCLARÉES travaillées ;
 *  - compétences  : compétences VALIDÉES par un tiers (déclarations confirmées) ;
 *  - stage        : carnets validés sur carnets attendus (inchangé, déjà réel) ;
 *  - évaluations  : NON MESURÉ ici — aucune source par étudiant n'est branchée,
 *    l'axe s'affiche « non mesuré » au lieu d'un chiffre inventé.
 * S'y ajoute la DERNIÈRE CONNEXION, lue dans l'annuaire du programme.
 *
 * (Ancien en-tête conservé ci-dessous pour l'historique.)
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
import type { LearnerCourseOpens, LearnerQuestionResults } from "@/application/ports/repositories";
import type { StageLog } from "@/domain/stageLog";
import type { Enrollment, Outcome, Person } from "@/domain/types";
import {
  buildLearnerCompetenceRows,
  type DeclarationsParInscription,
} from "@/features/administration/competenceTrackingViewModel";

export type TrackingAxis = "theory" | "competence" | "placement" | "assessment";

export const TRACKING_AXIS_LABELS_FR: Record<TrackingAxis, string> = {
  theory: "Bases théoriques",
  competence: "Compétences",
  placement: "Stage",
  assessment: "Évaluations",
};

export const TRACKING_AXIS_HINTS_FR: Record<TrackingAxis, string> = {
  theory: "Connaissances que l'étudiant a déclarées travaillées.",
  competence: "Compétences validées par un tiers.",
  placement: "Carnets de stage validés sur carnets attendus.",
  assessment: "Score moyen des réponses aux QCM, sur les réponses données.",
};

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
  /** Dernière connexion à la plateforme ; absente = jamais connecté. */
  readonly lastSignInAt?: string | undefined;
  /** Cours réellement ouverts : combien de fois, combien de cours distincts. */
  readonly courseOpens: number;
  readonly distinctCourses: number;
}

function theoryScore(
  enrollmentId: string,
  outcomes: readonly Outcome[],
  declarations: DeclarationsParInscription,
): AxisScore {
  const knowledge = outcomes.filter((o) => o.nature === "knowledge");
  const declarees = new Set(
    (declarations.get(enrollmentId) ?? []).map((r) => r.outcomeId as string),
  );
  const done = knowledge.filter((o) => declarees.has(o.id as string)).length;
  return score(done, knowledge.length);
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
  /** Conservé pour la signature ; l'axe n'est plus inventé à partir d'eux. */
  readonly assessments?: readonly AssessmentDefinition[];
  readonly expectedLogsPerLearner: number;
  readonly declarations?: DeclarationsParInscription;
  readonly lastSignInByPerson?: ReadonlyMap<string, string>;
  /** Tentatives de QCM par inscription — absentes, l'axe reste « non mesuré ». */
  readonly qcmByEnrollment?: ReadonlyMap<string, LearnerQuestionResults>;
  /** Ouvertures de cours par inscription — absentes, la colonne affiche 0. */
  readonly courseOpensByEnrollment?: ReadonlyMap<string, LearnerCourseOpens>;
}): readonly LearnerTrackingRow[] {
  const declarations = input.declarations ?? new Map();
  const competenceRows = new Map(
    buildLearnerCompetenceRows(input.enrollments, input.outcomes, declarations).map((r) => [
      r.enrollmentId,
      r,
    ]),
  );

  return input.enrollments
    .map((enrollment) => {
      const competenceRow = competenceRows.get(enrollment.id);
      const theory = theoryScore(enrollment.id, input.outcomes, declarations);
      const competence = score(competenceRow?.validated ?? 0, competenceRow?.total ?? 0);
      const placement = placementScore(enrollment.id, input.logs, input.expectedLogsPerLearner);
      /*
       * L'AXE ÉVALUATIONS, ENFIN LU EN BASE (25/09).
       *
       * Il valait `score(0, 0)` EN DUR depuis l'origine : la colonne affichait
       * « non mesuré » quoi que fassent les étudiants, et l'aurait affiché même
       * après cinquante QCM. Stef, le 25/09 : « ce tableau permet-il de voir ce
       * que les étudiants ont réellement fait ? » — sur cette colonne, non.
       *
       * Il vaut maintenant le SCORE MOYEN des réponses réellement données
       * (`question_attempts`, score EDN 0..1), rapporté au nombre de réponses :
       * « 12 sur 20 » se lit comme les autres axes. Aucune réponse = 0/0 =
       * « non mesuré », et l'axe ne pèse pas sur la moyenne — la règle d'avant,
       * qui reste juste : un étudiant qui n'a rien passé n'a pas échoué.
       */
      const qcm = input.qcmByEnrollment?.get(enrollment.id as string);
      const assessment =
        qcm && qcm.attempts > 0
          ? score(Math.round((qcm.avgScore ?? 0) * qcm.attempts), qcm.attempts)
          : score(0, 0);
      const ouvertures = input.courseOpensByEnrollment?.get(enrollment.id as string);
      const active = [theory, competence, placement, assessment].filter((a) => a.total > 0);
      return {
        enrollmentId: enrollment.id,
        cohortId: enrollment.cohortId,
        personName: input.people.find((p) => p.id === enrollment.personId)?.fullName ?? "Apprenant",
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
        courseOpens: ouvertures?.opens ?? 0,
        distinctCourses: ouvertures?.distinctCourses ?? 0,
        lastSignInAt: input.lastSignInByPerson?.get(enrollment.personId as string),
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
