/**
 * Modèle de vue (présentation pure) des sections dépliables du pilotage :
 * programmation, activité du programme, gestion des apprenants et
 * notifications qui découlent des marqueurs d'avancement.
 *
 * Aucune règle métier nouvelle : on dérive de façon déterministe ce que les
 * blocs affichent à partir des carnets reçus, des alertes et des inscriptions.
 */
import type { StageLog } from "@/domain/stageLog";
import type { SupervisionAlert } from "@/domain/supervision";
import type { Enrollment, Person } from "@/domain/types";

/* ------------------------------------------------------------------ */
/* Programmation de la promotion (simulée)                             */
/* ------------------------------------------------------------------ */

export type ProgrammingState = "planned" | "active" | "paused" | "closed";

export const PROGRAMMING_STATE_LABELS_FR: Record<ProgrammingState, string> = {
  planned: "programmé, non ouvert",
  active: "en cours",
  paused: "en pause",
  closed: "terminé",
};

export type ProgrammingAction = "activate" | "pause" | "resume" | "close" | "reopen";

export const PROGRAMMING_ACTION_LABELS_FR: Record<ProgrammingAction, string> = {
  activate: "Activer le programme",
  pause: "Mettre en pause",
  resume: "Reprendre",
  close: "Terminer",
  reopen: "Réouvrir",
};

/** Transitions autorisées : aucune action destructive implicite. */
export function nextProgrammingState(
  current: ProgrammingState,
  action: ProgrammingAction,
): ProgrammingState | null {
  switch (action) {
    case "activate":
      return current === "planned" ? "active" : null;
    case "pause":
      return current === "active" ? "paused" : null;
    case "resume":
      return current === "paused" ? "active" : null;
    case "close":
      return current === "active" || current === "paused" ? "closed" : null;
    case "reopen":
      return current === "closed" ? "active" : null;
    default:
      return null;
  }
}

export function allowedProgrammingActions(current: ProgrammingState): readonly ProgrammingAction[] {
  return (["activate", "pause", "resume", "close", "reopen"] as const).filter(
    (action) => nextProgrammingState(current, action) !== null,
  );
}

/* ------------------------------------------------------------------ */
/* Marqueurs d'avancement par apprenant                                */
/* ------------------------------------------------------------------ */

export type LearnerMarker = "late" | "awaiting_validation" | "in_progress" | "on_track" | "idle";

export const LEARNER_MARKER_LABELS_FR: Record<LearnerMarker, string> = {
  late: "en retard",
  awaiting_validation: "en attente de validation",
  in_progress: "en cours",
  on_track: "à jour",
  idle: "aucune activité",
};

export interface LearnerActivityRow {
  readonly enrollmentId: string;
  readonly personName: string;
  readonly status: Enrollment["status"];
  readonly logCount: number;
  readonly entryCount: number;
  readonly validatedCount: number;
  readonly awaitingCount: number;
  readonly alertCount: number;
  readonly lastActivityAt?: string | undefined;
  readonly progressPercent: number;
  readonly marker: LearnerMarker;
}

const validated = (log: StageLog) =>
  log.status === "validated" ||
  log.status === "transmitted" ||
  log.validations.some((v) => v.decision === "validated");

function markerFor(row: Omit<LearnerActivityRow, "marker">): LearnerMarker {
  if (row.alertCount > 0) return "late";
  if (row.logCount === 0) return "idle";
  if (row.awaitingCount > 0) return "awaiting_validation";
  return row.progressPercent >= 100 ? "on_track" : "in_progress";
}

/**
 * Une ligne par inscription de la promotion. Le dénominateur d'avancement est
 * le nombre de carnets attendus (modèles applicables), jamais une estimation.
 */
export function buildLearnerActivityRows(input: {
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly logs: readonly StageLog[];
  readonly alerts: readonly SupervisionAlert[];
  readonly expectedLogsPerLearner: number;
}): readonly LearnerActivityRow[] {
  const expected = Math.max(1, input.expectedLogsPerLearner);
  return input.enrollments
    .map((enrollment) => {
      const logs = input.logs.filter((l) => l.enrollmentId === enrollment.id);
      const entryCount = logs.reduce((n, l) => n + l.entries.length, 0);
      const validatedCount = logs.filter(validated).length;
      const awaitingCount = logs.filter(
        (l) => l.status === "submitted" || l.status === "needs_revision",
      ).length;
      const dates = logs.flatMap((l) => l.entries.map((e) => e.occurredAt)).sort();
      const base = {
        enrollmentId: enrollment.id,
        personName: input.people.find((p) => p.id === enrollment.personId)?.fullName ?? "Apprenant",
        status: enrollment.status,
        logCount: logs.length,
        entryCount,
        validatedCount,
        awaitingCount,
        alertCount: input.alerts.filter((a) => a.enrollmentId === enrollment.id).length,
        lastActivityAt: dates[dates.length - 1],
        progressPercent: Math.min(100, Math.round((validatedCount / expected) * 100)),
      };
      return { ...base, marker: markerFor(base) };
    })
    .sort((a, b) => a.personName.localeCompare(b.personName, "fr"));
}

/* ------------------------------------------------------------------ */
/* Synthèse de groupe (les « stat moy » du bloc activité)              */
/* ------------------------------------------------------------------ */

export interface GroupActivitySummary {
  readonly learners: number;
  readonly averageProgressPercent: number;
  readonly averageEntries: number;
  readonly averageLogs: number;
  readonly activeLearners: number;
  readonly idleLearners: number;
  readonly lateLearners: number;
  readonly awaitingValidation: number;
  readonly markerCounts: Readonly<Record<LearnerMarker, number>>;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export function summarizeGroupActivity(rows: readonly LearnerActivityRow[]): GroupActivitySummary {
  const markerCounts = (
    ["late", "awaiting_validation", "in_progress", "on_track", "idle"] as const
  ).reduce(
    (acc, marker) => ({ ...acc, [marker]: rows.filter((r) => r.marker === marker).length }),
    {} as Record<LearnerMarker, number>,
  );
  return {
    learners: rows.length,
    averageProgressPercent: Math.round(mean(rows.map((r) => r.progressPercent))),
    averageEntries: Math.round(mean(rows.map((r) => r.entryCount)) * 10) / 10,
    averageLogs: Math.round(mean(rows.map((r) => r.logCount)) * 10) / 10,
    activeLearners: rows.filter((r) => r.logCount > 0).length,
    idleLearners: markerCounts.idle,
    lateLearners: markerCounts.late,
    awaitingValidation: rows.reduce((n, r) => n + r.awaitingCount, 0),
    markerCounts,
  };
}

/* ------------------------------------------------------------------ */
/* Notifications découlant des marqueurs                               */
/* ------------------------------------------------------------------ */

export interface SuggestedNotification {
  readonly id: string;
  readonly marker: LearnerMarker;
  readonly label: string;
  readonly recipients: readonly string[];
  readonly rationale: string;
}

const NOTIFICATION_RULES: readonly {
  readonly marker: LearnerMarker;
  readonly label: string;
  readonly rationale: string;
}[] = [
  {
    marker: "late",
    label: "Relance de retard",
    rationale: "Au moins un signal de retard ouvert sur l'apprenant.",
  },
  {
    marker: "idle",
    label: "Rappel de démarrage",
    rationale: "Aucun carnet déposé depuis l'ouverture de la promotion.",
  },
  {
    marker: "awaiting_validation",
    label: "Rappel aux responsables de stage",
    rationale: "Des carnets déposés attendent une validation humaine.",
  },
  {
    marker: "on_track",
    label: "Information de fin de parcours",
    rationale: "Parcours de carnets complet : préparer le certificat.",
  },
];

/** Notifications proposées, jamais envoyées : maquette uniquement. */
export function buildSuggestedNotifications(
  rows: readonly LearnerActivityRow[],
): readonly SuggestedNotification[] {
  return NOTIFICATION_RULES.map((rule) => ({
    id: `notif-${rule.marker}`,
    marker: rule.marker,
    label: rule.label,
    rationale: rule.rationale,
    recipients: rows.filter((r) => r.marker === rule.marker).map((r) => r.personName),
  })).filter((n) => n.recipients.length > 0);
}
