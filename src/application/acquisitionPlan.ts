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
  /**
   * Natures concernees. AU PLURIEL depuis le 03/09 : un jalon porte souvent des
   * connaissances ET des competences, et le reduire a une seule nature obligeait
   * a en fabriquer un par acquis.
   */
  readonly natures: readonly OutcomeNature[];
  /**
   * Acquis portes par l'evenement. UN JALON EN PORTE PLUSIEURS — c'est tout le
   * defaut corrige le 03/09 : le calendrier poussait un evenement par acquis,
   * etiquete du libelle du jalon. Les 29 jalons de la promotion s'affichaient
   * alors en 366 lignes, la meme repetee jusqu'a douze fois. Mesure en base :
   * 29 jalons, 29 libelles distincts, aucun doublon. Le doublon etait ici.
   */
  readonly itemIds: readonly OutcomeId[];
}

export interface AcquisitionPlanPresentation {
  readonly items: readonly AcquisitionPlanItem[];
  readonly tracks: readonly AcquisitionPlanTrack[];
  readonly events: readonly PlanCalendarEvent[];
  readonly range: { readonly start: IsoDateTime; readonly end: IsoDateTime };
}

/**
 * `fallbackSchedule` A ETE SUPPRIMEE LE 03/09. Elle fabriquait, pour tout acquis
 * absent du retroplanning, une date de debut a `ancrage + rang x 21 jours` et une
 * echeance 28 jours plus tard. L'apprenant lisait donc « echeance 28/09/2026 » sur
 * un acquis que personne n'avait planifie — une date inventee, plausible, et donc
 * invisible. Un acquis sans jalon n'a plus de dates du tout : `startsOn` et `dueOn`
 * valent `null`, les ecrans disent « non planifie ».
 */

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
  const items: AcquisitionPlanItem[] = input.progress.map((progress) => {
    const entry = input.schedule.find((s) => s.outcomeId === progress.outcome.id);
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
      startsOn: entry ? entry.startsOn : null,
      dueOn: entry ? entry.dueOn : null,
      milestoneLabel: entry ? entry.milestoneLabel : null,
      officialDeadline: entry?.official ?? false,
      requiresThirdPartyValidation: progress.outcome.nature === "real_competence",
      countedEvidence: progress.countedEvidence.length,
      pendingEvidence: progress.pendingEvidence.length,
      dependsOn,
      ...(progress.declaredLevel === undefined ? {} : { declaredLevel: progress.declaredLevel }),
      ...(progress.outcome.themeId === undefined ? {} : { themeId: progress.outcome.themeId }),
    };
  });

  /**
   * Les acquis planifies d'abord, par echeance ; les non planifies ensuite, par
   * code. Les mettre en tete parce qu'ils n'ont pas de date reviendrait a placer
   * en premier ce qui n'est justement pas au programme de la semaine.
   */
  items.sort((a, b) => {
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn) || a.code.localeCompare(b.code);
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    return a.code.localeCompare(b.code);
  });

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

  /*
   * UN EVENEMENT PAR JALON. La cle de regroupement est le couple (libelle,
   * echeance) et non l'identifiant du jalon : le presenter ne recoit pas les
   * jalons, il recoit leur projection sur les acquis. Deux jalons homonymes
   * tombant la meme semaine seraient fondus — c'est acceptable, et la base
   * l'interdit deja (29 jalons, 29 libelles distincts, mesure du 03/09).
   */
  const jalons = new Map<
    string,
    { date: IsoDateTime; label: string; itemIds: OutcomeId[]; natures: Set<OutcomeNature> }
  >();
  for (const item of items) {
    if (!item.dueOn || !item.milestoneLabel) continue;
    const cle = `${item.milestoneLabel}|${item.dueOn}`;
    const groupe = jalons.get(cle) ?? {
      date: item.dueOn,
      label: item.milestoneLabel,
      itemIds: [],
      natures: new Set<OutcomeNature>(),
    };
    groupe.itemIds.push(item.id);
    groupe.natures.add(item.nature);
    jalons.set(cle, groupe);
  }
  for (const [cle, groupe] of jalons) {
    events.push({
      id: `milestone-${cle}`,
      date: groupe.date,
      label: groupe.label,
      kind: "milestone",
      natures: [...groupe.natures],
      itemIds: groupe.itemIds,
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
      natures: [nature],
      itemIds: [ev.outcomeId],
    });
    for (const validation of ev.validations) {
      events.push({
        id: `validation-${ev.id}-${validation.decidedAt}`,
        date: validation.decidedAt,
        label: `Validation — ${ev.title}`,
        kind: "validation",
        natures: [nature],
        itemIds: [ev.outcomeId],
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
      natures: ["real_competence"],
      itemIds: [],
    });
    events.push({
      id: `placement-end-${assignment.id}`,
      date: assignment.endsOn,
      label: `Fin de stage — ${placement.name}`,
      kind: "placement",
      natures: ["real_competence"],
      itemIds: [],
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // Les acquis non planifies n'ont pas de date : ils ne tirent pas la plage.
  const dates = [
    ...items.map((i) => i.startsOn),
    ...items.map((i) => i.dueOn),
    ...events.map((e) => e.date),
  ]
    .filter((d): d is IsoDateTime => d !== null)
    .sort();

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
