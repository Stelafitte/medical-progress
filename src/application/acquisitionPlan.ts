/**
 * Presenter du plan d'acquisition.
 *
 * Transforme la vérité métier (acquis, preuves, stages, calendrier de
 * référence) en un modèle de présentation unique, consommé par les quatre vues
 * du Passeport. L'UI n'accède jamais aux mocks directement.
 */
import {
  progressPercent,
  stageForProgress,
  trackForNature,
  TRACK_LABELS_FR,
  type AcquisitionPlanItem,
  type AcquisitionPlanTrack,
  type AcquisitionTrack,
  type PlanScheduleEntry,
} from "@/domain/acquisitionPlan";
import type { OutcomeProgress } from "@/domain/mastery";
import type {
  Evidence,
  IsoDateTime,
  OutcomeId,
  OutcomeNature,
  OutcomeRelation,
  Placement,
  PlacementAssignment,
} from "@/domain/types";

export interface PlanCalendarEvent {
  readonly id: string;
  readonly date: IsoDateTime;
  readonly label: string;
  readonly kind: "milestone" | "evidence" | "validation" | "placement";
  /** Permet les filtres Connaissances / Compétences simulées / réelles. */
  readonly nature: OutcomeNature;
  readonly itemId?: OutcomeId;
}

export interface AcquisitionPlanPresentation {
  readonly items: readonly AcquisitionPlanItem[];
  readonly tracks: readonly AcquisitionPlanTrack[];
  readonly events: readonly PlanCalendarEvent[];
  readonly range: { readonly start: IsoDateTime; readonly end: IsoDateTime };
}

const DAY = 24 * 60 * 60 * 1000;

function fallbackSchedule(index: number, anchor: number): { startsOn: string; dueOn: string } {
  const start = new Date(anchor + index * 21 * DAY);
  const due = new Date(start.getTime() + 28 * DAY);
  return { startsOn: start.toISOString(), dueOn: due.toISOString() };
}

export interface BuildAcquisitionPlanInput {
  readonly progress: readonly OutcomeProgress[];
  readonly evidence: readonly Evidence[];
  readonly relations: readonly OutcomeRelation[];
  readonly schedule: readonly PlanScheduleEntry[];
  readonly placements: readonly Placement[];
  readonly assignments: readonly PlacementAssignment[];
  /** Point d'ancrage déterministe pour les acquis sans calendrier de référence. */
  readonly anchorDate: IsoDateTime;
}

export function buildAcquisitionPlan(
  input: BuildAcquisitionPlanInput,
): AcquisitionPlanPresentation {
  const anchor = new Date(input.anchorDate).getTime();

  const items: AcquisitionPlanItem[] = input.progress.map((progress, index) => {
    const entry = input.schedule.find((s) => s.outcomeId === progress.outcome.id);
    const dates = entry ?? fallbackSchedule(index, anchor);
    const dependsOn = input.relations
      .filter((r) => r.kind === "prerequisite_of" && r.toOutcomeId === progress.outcome.id)
      .map((r) => r.fromOutcomeId);

    return {
      id: progress.outcome.id,
      code: progress.outcome.code,
      label: progress.outcome.label,
      nature: progress.outcome.nature,
      track: trackForNature(progress.outcome.nature),
      stage: stageForProgress(progress),
      mastery: progress.mastery,
      targetMastery: progress.outcome.targetMastery,
      progressPercent: progressPercent(progress.mastery, progress.outcome.targetMastery),
      startsOn: dates.startsOn,
      dueOn: dates.dueOn,
      milestoneLabel: entry?.milestoneLabel ?? `Jalon ${progress.outcome.code}`,
      officialDeadline: entry?.official ?? false,
      requiresThirdPartyValidation: progress.outcome.nature === "real_competence",
      countedEvidence: progress.countedEvidence.length,
      pendingEvidence: progress.pendingEvidence.length,
      dependsOn,
    };
  });

  items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.code.localeCompare(b.code));

  const tracks: readonly AcquisitionPlanTrack[] = (
    ["knowledge", "competence"] as readonly AcquisitionTrack[]
  ).map((track) => ({
    track,
    label: TRACK_LABELS_FR[track],
    description:
      track === "knowledge"
        ? "Ce que je dois savoir, évalué par des épreuves de connaissances."
        : "Ce que je dois savoir faire, en situation simulée puis en situation réelle validée.",
    items: items.filter((i) => i.track === track),
  }));

  const natureById = new Map(items.map((i) => [i.id, i.nature] as const));

  const events: PlanCalendarEvent[] = [];

  for (const item of items) {
    events.push({
      id: `milestone-${item.id}`,
      date: item.dueOn,
      label: item.milestoneLabel,
      kind: "milestone",
      nature: item.nature,
      itemId: item.id,
    });
  }

  for (const ev of input.evidence) {
    const nature = natureById.get(ev.outcomeId);
    if (!nature) continue;
    events.push({
      id: `evidence-${ev.id}`,
      date: ev.occurredAt,
      label: ev.title,
      kind: "evidence",
      nature,
      itemId: ev.outcomeId,
    });
    for (const validation of ev.validations) {
      events.push({
        id: `validation-${ev.id}-${validation.decidedAt}`,
        date: validation.decidedAt,
        label: `Validation — ${ev.title}`,
        kind: "validation",
        nature,
        itemId: ev.outcomeId,
      });
    }
  }

  for (const assignment of input.assignments) {
    const placement = input.placements.find((p) => p.id === assignment.placementId);
    if (!placement) continue;
    events.push({
      id: `placement-${assignment.id}`,
      date: assignment.startsOn,
      label: `Début de stage — ${placement.name}`,
      kind: "placement",
      nature: "real_competence",
    });
    events.push({
      id: `placement-end-${assignment.id}`,
      date: assignment.endsOn,
      label: `Fin de stage — ${placement.name}`,
      kind: "placement",
      nature: "real_competence",
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const dates = [
    ...items.map((i) => i.startsOn),
    ...items.map((i) => i.dueOn),
    ...events.map((e) => e.date),
  ].sort();

  return {
    items,
    tracks,
    events,
    range: {
      start: dates[0] ?? input.anchorDate,
      end: dates[dates.length - 1] ?? input.anchorDate,
    },
  };
}
