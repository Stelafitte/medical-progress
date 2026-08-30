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
      .map((e) => e.itemId as string)
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
});
