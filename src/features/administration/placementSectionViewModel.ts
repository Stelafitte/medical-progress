/**
 * Modèle de vue (présentation pure) de l'onglet « Gestion des stages ».
 *
 * Rien ici ne touche au domaine ni à l'infrastructure : ces fonctions dérivent,
 * de façon déterministe, ce que l'écran doit afficher — responsable d'un
 * terrain, association aux apprenants d'une cohorte, et suivi des étapes de
 * validation d'un stage (compétences, validation finale, carnet reçu).
 */
import type { LocalPlacement } from "@/domain/placementDraft";
import type {
  Enrollment,
  Person,
  Placement,
  PlacementAssignment,
} from "@/domain/types";

/** Nom du responsable d'un terrain : encadrant saisi, sinon encadrant affecté. */
export function supervisorNameFor(
  placement: Placement,
  local: readonly LocalPlacement[],
  assignments: readonly PlacementAssignment[],
  people: readonly Person[],
): string | null {
  const declared = local.find((l) => l.placement.id === placement.id)?.supervisor;
  if (declared && declared.length > 0) return declared;
  const assigned = assignments.find((a) => a.placementId === placement.id);
  if (!assigned) return null;
  return people.find((p) => p.id === assigned.supervisorPersonId)?.fullName ?? null;
}

export interface PlacementCohortRow {
  readonly enrollmentId: string;
  readonly learnerName: string;
  readonly placementName: string | null;
  readonly status: PlacementAssignment["status"] | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
}

export const PLACEMENT_ASSIGNMENT_STATUS_FR: Record<PlacementAssignment["status"], string> = {
  planned: "Affectation prévue",
  in_progress: "Stage en cours",
  completed: "Stage terminé",
  cancelled: "Affectation annulée",
};

/** Apprenants d'une cohorte, associés ou non à un terrain de stage. */
export function buildCohortPlacementRows(args: {
  readonly cohortId: string;
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly placements: readonly Placement[];
  readonly assignments: readonly PlacementAssignment[];
}): readonly PlacementCohortRow[] {
  return args.enrollments
    .filter((enrollment) => enrollment.cohortId === args.cohortId)
    .map((enrollment) => {
      const assignment = args.assignments.find((a) => a.enrollmentId === enrollment.id);
      const placement = args.placements.find((p) => p.id === assignment?.placementId);
      return {
        enrollmentId: enrollment.id,
        learnerName:
          args.people.find((p) => p.id === enrollment.personId)?.fullName ?? "Apprenant",
        placementName: placement?.name ?? null,
        status: assignment?.status ?? null,
        startsOn: assignment?.startsOn ?? null,
        endsOn: assignment?.endsOn ?? null,
      };
    });
}

export interface StageTrackingStep {
  readonly label: string;
  readonly state: "done" | "pending" | "blocked";
  readonly detail: string;
}

export interface StageTrackingRow {
  readonly enrollmentId: string;
  readonly learnerName: string;
  readonly placementName: string;
  readonly steps: readonly StageTrackingStep[];
}

function seedOf(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

/**
 * Suivi d'un stage : compétences réelles validées par l'encadrant, validation
 * finale humaine, puis réception du carnet quand le Concepteur l'a prévu.
 * Déterministe : mêmes entrées, mêmes étapes.
 */
export function buildStageTrackingRows(args: {
  readonly rows: readonly PlacementCohortRow[];
  readonly competencesExpected: number;
  readonly logbookExpected: boolean;
}): readonly StageTrackingRow[] {
  return args.rows
    .filter((row) => row.placementName !== null && row.status !== null)
    .map((row) => {
      const seed = seedOf(row.enrollmentId);
      const expected = Math.max(1, args.competencesExpected);
      const validated =
        row.status === "completed" ? expected : Math.min(expected, seed % (expected + 1));
      const competencesDone = validated >= expected;
      const finalDone = row.status === "completed" && competencesDone;

      const steps: StageTrackingStep[] = [
        {
          label: "Compétences réelles validées par l'encadrant",
          state: competencesDone ? "done" : "pending",
          detail: `${validated}/${expected} compétence(s) contresignée(s)`,
        },
        {
          label: "Validation finale du stage",
          state: finalDone ? "done" : competencesDone ? "pending" : "blocked",
          detail: finalDone
            ? "Prononcée par un validateur humain"
            : competencesDone
              ? "En attente de la décision du responsable"
              : "Bloquée : compétences incomplètes",
        },
      ];

      if (args.logbookExpected) {
        steps.push({
          label: "Réception du carnet de stage",
          state: finalDone ? "done" : seed % 2 === 0 ? "pending" : "blocked",
          detail: finalDone
            ? "Carnet reçu et archivé"
            : "Carnet attendu, prévu par le Concepteur de programme",
        });
      }

      return {
        enrollmentId: row.enrollmentId,
        learnerName: row.learnerName,
        placementName: row.placementName as string,
        steps,
      };
    });
}

export const STAGE_STEP_STATE_FR: Record<StageTrackingStep["state"], string> = {
  done: "Fait",
  pending: "À faire",
  blocked: "Bloqué",
};
