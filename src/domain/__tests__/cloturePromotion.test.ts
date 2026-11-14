import { describe, expect, it } from "vitest";
import {
  defaultPilotCohortId,
  isCohortClosed,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";
import type { Cohort, CohortId, CurriculumVersionId, ProgramId } from "../types";

const promo = (patch: Partial<Cohort> & { label: string }): Cohort =>
  ({
    id: `coh-${patch.label}` as CohortId,
    programId: "prog-1" as ProgramId,
    curriculumVersionId: "cv-1" as CurriculumVersionId,
    academicYear: "2026-2027",
    startsOn: "2026-09-01",
    endsOn: "2026-11-15",
    learnerCount: 0,
    status: "in_progress",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    provenance: { sourceSystem: "native" },
    ...patch,
  }) as Cohort;

const LE_14_NOV = new Date("2026-11-14T12:00:00Z");

describe("clôture d'une promotion (Stef, 14/11)", () => {
  it("reconnaît une promotion clôturée ou archivée, pas une promotion en cours", () => {
    expect(isCohortClosed(promo({ label: "A", status: "completed" }))).toBe(true);
    expect(isCohortClosed(promo({ label: "B", status: "archived" }))).toBe(true);
    expect(isCohortClosed(promo({ label: "C", archivedAt: "2026-11-01T00:00:00Z" }))).toBe(true);
    expect(isCohortClosed(promo({ label: "D", status: "in_progress" }))).toBe(false);
    expect(isCohortClosed(promo({ label: "E", status: "open" }))).toBe(false);
  });

  it("met la promotion clôturée DERRIÈRE, même si ses dates la disent encore en cours", () => {
    const ordre = sortCohortsForPilot(
      [
        promo({ label: "Ancienne", status: "completed" }),
        promo({
          label: "Actuelle",
          status: "in_progress",
          startsOn: "2026-11-02",
          endsOn: "2027-01-24",
        }),
      ],
      LE_14_NOV,
    );
    expect(ordre.map((c) => c.label)).toEqual(["Actuelle", "Ancienne"]);
  });

  it("propose par défaut la promotion vivante, jamais la clôturée", () => {
    const cohortes = [
      promo({ label: "Ancienne", status: "completed" }),
      promo({ label: "Actuelle", status: "open", startsOn: "2026-12-01", endsOn: "2027-02-20" }),
    ];
    expect(defaultPilotCohortId(cohortes, LE_14_NOV)).toBe("coh-Actuelle");
  });

  it("n'écarte pas une promotion qui n'a pas de remplaçante : elle reste proposée", () => {
    const seule = [promo({ label: "Seule", status: "completed" })];
    expect(defaultPilotCohortId(seule, LE_14_NOV)).toBe("coh-Seule");
  });
});
