import { describe, expect, it } from "vitest";
import { buildAcquisitionPlan } from "@/application/acquisitionPlan";
import { computeOutcomeProgress } from "@/domain/mastery";
import { PLAN_STAGES } from "@/domain/acquisitionPlan";
import * as fx from "@/infrastructure/mock/fixtures";

const programId = "prog-diu-echo";
const enrollmentId = "enr-diu";

function plan() {
  const outcomes = fx.outcomes.filter((o) => o.programId === programId);
  const evidence = fx.evidence.filter((e) => e.enrollmentId === enrollmentId);
  const ids = new Set(outcomes.map((o) => o.id));

  return buildAcquisitionPlan({
    progress: outcomes.map((o) => computeOutcomeProgress(o, evidence)),
    evidence,
    relations: fx.outcomeRelations.filter(
      (r) => ids.has(r.fromOutcomeId) && ids.has(r.toOutcomeId),
    ),
    schedule: fx.planSchedule.filter((s) => ids.has(s.outcomeId)),
    placements: fx.placements.filter((p) => p.programId === programId),
    assignments: fx.placementAssignments.filter((a) => a.enrollmentId === enrollmentId),
    anchorDate: "2026-06-01T00:00:00Z",
  });
}

describe("presenter du plan d'acquisition", () => {
  it("dérive un élément de plan par acquis du programme", () => {
    const { items } = plan();
    expect(items).toHaveLength(4);
    expect(new Set(items.map((i) => i.id)).size).toBe(4);
  });

  it("alimente les quatre vues avec les mêmes identifiants", () => {
    const { items, tracks, events } = plan();
    const listIds = [...items].map((i) => i.id).sort();

    const kanbanIds = PLAN_STAGES.flatMap((stage) =>
      items.filter((i) => i.stage === stage).map((i) => i.id),
    ).sort();
    const ganttIds = items
      .filter((i) => i.startsOn && i.dueOn)
      .map((i) => i.id)
      .sort();
    const calendarIds = events
      .filter((e) => e.kind === "milestone")
      .flatMap((e) => e.itemIds as string[])
      .sort();
    const trackIds = tracks.flatMap((t) => t.items.map((i) => i.id)).sort();

    expect(kanbanIds).toEqual(listIds);
    expect(ganttIds).toEqual(listIds);
    expect(calendarIds).toEqual(listIds);
    expect(trackIds).toEqual(listIds);
  });

  it("sépare les pistes connaissances et compétences", () => {
    const { tracks } = plan();
    expect(tracks.map((t) => t.track)).toEqual(["knowledge", "competence"]);
    expect(tracks[0]?.items.every((i) => i.nature === "knowledge")).toBe(true);
    expect(tracks[1]?.items.every((i) => i.nature !== "knowledge")).toBe(true);
  });

  it("expose stages, preuves, validations et jalons dans le calendrier", () => {
    const { events, range } = plan();
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["milestone", "evidence", "validation", "placement"]));
    expect(range.start <= range.end).toBe(true);
  });

  it("rattache les prérequis pour la vue Gantt", () => {
    const item = plan().items.find((i) => i.id === "out-echo-fevg");
    expect(item?.dependsOn).toContain("out-echo-coupes");
  });

  /**
   * LE DEFAUT DU 03/09. Le calendrier poussait un evenement par ACQUIS etiquete
   * du libelle du JALON : les 29 jalons de la promotion s'affichaient en
   * 366 lignes, la meme repetee jusqu'a douze fois. Mesure en base le meme jour :
   * 29 jalons, 29 libelles distincts, aucun doublon. Le doublon etait dans le
   * presenter, pas dans les donnees.
   */
  it("ne pousse qu'un evenement par jalon, meme s'il porte plusieurs acquis", () => {
    const { events } = plan();
    const jalons = events.filter((e) => e.kind === "milestone");
    const cles = jalons.map((e) => `${e.label}|${e.date}`);
    expect(new Set(cles).size).toBe(jalons.length);
  });

  /**
   * `fallbackSchedule` fabriquait `ancrage + rang x 21 jours` pour tout acquis
   * absent du retroplanning : l'apprenant lisait une echeance que personne
   * n'avait posee. Une date inventee est pire qu'une date absente — elle ne se
   * voit pas.
   */
  it("n'invente aucune date pour un acquis absent du retroplanning", () => {
    const outcomes = fx.outcomes.filter((o) => o.programId === programId);
    const sansCalendrier = buildAcquisitionPlan({
      progress: outcomes.map((o) => computeOutcomeProgress(o, [])),
      evidence: [],
      relations: [],
      schedule: [],
      placements: [],
      assignments: [],
      anchorDate: "2026-06-01T00:00:00Z",
    });

    expect(sansCalendrier.items).toHaveLength(outcomes.length);
    expect(sansCalendrier.items.every((i) => i.startsOn === null)).toBe(true);
    expect(sansCalendrier.items.every((i) => i.dueOn === null)).toBe(true);
    expect(sansCalendrier.items.every((i) => i.milestoneLabel === null)).toBe(true);
    expect(sansCalendrier.events.filter((e) => e.kind === "milestone")).toHaveLength(0);
  });

  /** Les acquis planifies passent devant : un acquis sans date n'est pas urgent. */
  it("classe les acquis non planifies apres les acquis planifies", () => {
    const outcomes = fx.outcomes.filter((o) => o.programId === programId);
    const ids = new Set(outcomes.map((o) => o.id));
    const complet = fx.planSchedule.filter((s) => ids.has(s.outcomeId));
    const partiel = complet.slice(0, 1);

    const { items } = buildAcquisitionPlan({
      progress: outcomes.map((o) => computeOutcomeProgress(o, [])),
      evidence: [],
      relations: [],
      schedule: partiel,
      placements: [],
      assignments: [],
      anchorDate: "2026-06-01T00:00:00Z",
    });

    const premierSansDate = items.findIndex((i) => i.dueOn === null);
    const dernierAvecDate = items.map((i) => i.dueOn !== null).lastIndexOf(true);
    expect(premierSansDate).toBeGreaterThan(dernierAvecDate);
  });
});
