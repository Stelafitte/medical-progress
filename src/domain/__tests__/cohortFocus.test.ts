import { describe, expect, it } from "vitest";
import { sortCohortsForPilot } from "@/features/administration/adminProgramViewModel";
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

const LE_16_SEPT = new Date("2026-09-16T12:00:00Z");

describe("départager deux promotions aux mêmes dates", () => {
  /* ⚠️ Stef, 16/09 : « je trouve bizarre que seule la promotion 2026-2027
     apparaisse alors que celle qui est activée c'est la promotion test SL ».
     Les deux promotions du DFASM ont EXACTEMENT les mêmes dates : le tri était
     à égalité, et c'est l'ordre de la base qui tranchait. */
  it("met la promotion EN COURS devant celle qui n'est qu'ouverte", () => {
    const ordre = sortCohortsForPilot(
      [promo({ label: "B", status: "open" }), promo({ label: "A", status: "in_progress" })],
      LE_16_SEPT,
    );
    expect(ordre[0]?.label).toBe("A");
  });

  it("met un brouillon derrière une promotion ouverte", () => {
    const ordre = sortCohortsForPilot(
      [promo({ label: "B", status: "draft" }), promo({ label: "A", status: "open" })],
      LE_16_SEPT,
    );
    expect(ordre.map((c) => c.label)).toEqual(["A", "B"]);
  });

  it("à statut ET dates identiques, trie par nom — arbitraire, mais STABLE", () => {
    /* Mieux vaut un ordre arbitraire et constant qu'un ordre qui change d'un
       rechargement à l'autre : c'est ce qui rendait le défaut incompréhensible. */
    const ordre = sortCohortsForPilot(
      [promo({ label: "Zébu" }), promo({ label: "Alpha" })],
      LE_16_SEPT,
    );
    expect(ordre.map((c) => c.label)).toEqual(["Alpha", "Zébu"]);
    const ordreInverse = sortCohortsForPilot(
      [promo({ label: "Alpha" }), promo({ label: "Zébu" })],
      LE_16_SEPT,
    );
    expect(ordreInverse.map((c) => c.label)).toEqual(["Alpha", "Zébu"]);
  });

  it("garde la règle d'origine : une promotion en cours passe avant une à venir", () => {
    const ordre = sortCohortsForPilot(
      [
        promo({ label: "AVenir", startsOn: "2027-01-01", endsOn: "2027-06-01" }),
        promo({ label: "EnCours" }),
      ],
      LE_16_SEPT,
    );
    expect(ordre[0]?.label).toBe("EnCours");
  });

  it("et une promotion terminée passe en dernier", () => {
    const ordre = sortCohortsForPilot(
      [
        promo({ label: "Finie", startsOn: "2025-09-01", endsOn: "2025-11-15" }),
        promo({ label: "EnCours" }),
      ],
      LE_16_SEPT,
    );
    expect(ordre.map((c) => c.label)).toEqual(["EnCours", "Finie"]);
  });
});
