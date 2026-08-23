import { describe, expect, it } from "vitest";
import {
  buildPlacementFromInput,
  EMPTY_NEW_PLACEMENT_INPUT,
  mergePlacements,
  validateNewPlacement,
} from "@/domain/placementDraft";
import type { Placement, PlacementId, ProgramId } from "@/domain/types";

const programId = "prog-diu" as ProgramId;

const valid = {
  ...EMPTY_NEW_PLACEMENT_INPUT,
  name: " Échographie ",
  site: "CHU",
  department: "Cardiologie",
  capacity: "4",
  supervisor: " Dr Martin ",
} as const;

describe("validateNewPlacement", () => {
  it("exige nom, lieu et service", () => {
    expect(validateNewPlacement(EMPTY_NEW_PLACEMENT_INPUT)).toEqual([
      "name-required",
      "site-required",
      "department-required",
    ]);
  });

  it("refuse une capacité non entière", () => {
    expect(validateNewPlacement({ ...valid, capacity: "quatre" })).toEqual(["capacity-invalid"]);
  });

  it("accepte une saisie complète", () => {
    expect(validateNewPlacement(valid)).toEqual([]);
  });
});

describe("buildPlacementFromInput", () => {
  it("construit un terrain déterministe et nettoyé", () => {
    const created = buildPlacementFromInput(valid, {
      programId,
      now: "2026-01-01T00:00:00.000Z",
      sequence: 2,
    });
    expect(created.placement.id).toBe("plc-local-2");
    expect(created.placement.name).toBe("Échographie");
    expect(created.placement.capacity).toBe(4);
    expect(created.supervisor).toBe("Dr Martin");
    expect(created.validationMode).toBe("logbook");
  });
});

describe("mergePlacements", () => {
  it("fusionne sans doublon d'identifiant", () => {
    const stored: Placement[] = [
      {
        id: "plc-1" as PlacementId,
        createdAt: "2026-01-01T00:00:00.000Z",
        provenance: { sourceSystem: "native" },
        programId,
        name: "Existant",
        site: "CHU",
        department: "Cardiologie",
        capacity: 2,
      },
    ];
    const local = buildPlacementFromInput(valid, {
      programId,
      now: "2026-01-01T00:00:00.000Z",
      sequence: 1,
    });
    expect(mergePlacements(stored, [local]).map((p) => p.id)).toEqual(["plc-1", "plc-local-1"]);
  });
});
