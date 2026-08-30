import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalPlacement,
  listLocalPlacements,
  resetLocalPlacements,
} from "@/application/placementDraftStore";
import { EMPTY_NEW_PLACEMENT_INPUT } from "@/domain/placementDraft";
import type { ProgramId } from "@/domain/types";

const programId = "prog-diu" as ProgramId;
const input = {
  ...EMPTY_NEW_PLACEMENT_INPUT,
  name: "Échographie",
  site: "CHU",
  department: "Cardiologie",
  capacity: "4",
};

describe("placementDraftStore", () => {
  beforeEach(() => resetLocalPlacements());

  it("ajoute le terrain à la liste unique", () => {
    const created = createLocalPlacement({ input, programId, now: "2026-01-01T00:00:00.000Z" });
    expect(created?.placement.name).toBe("Échographie");
    expect(listLocalPlacements()).toHaveLength(1);
  });

  it("n'écrit rien quand la saisie est invalide", () => {
    expect(createLocalPlacement({ input: EMPTY_NEW_PLACEMENT_INPUT, programId })).toBeNull();
    expect(listLocalPlacements()).toHaveLength(0);
  });
});
