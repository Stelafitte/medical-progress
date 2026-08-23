import { describe, expect, it } from "vitest";
import {
  EMPTY_NEW_ACCESS_GRANT_INPUT,
  buildAccessGrantFromInput,
  grantsForProgram,
  validateNewAccessGrant,
} from "@/domain/accessGrant";
import type { ProgramId, RoleAssignment } from "@/domain/types";

const programId = "prog-diu" as ProgramId;

describe("accessGrant", () => {
  it("exige une personne, un motif et refuse un rôle incohérent avec sa portée", () => {
    const issues = validateNewAccessGrant(EMPTY_NEW_ACCESS_GRANT_INPUT, {
      programId,
      existing: [],
    });
    expect(issues).toContain("person-required");
    expect(issues).toContain("justification-required");
  });

  it("refuse un encadrant de stage sans terrain", () => {
    const issues = validateNewAccessGrant(
      {
        ...EMPTY_NEW_ACCESS_GRANT_INPUT,
        personId: "person-1",
        role: "placement_supervisor",
        scopeKind: "program",
        justification: "encadrement",
      },
      { programId, existing: [] },
    );
    expect(issues).toContain("role-scope-inconsistent");
  });

  it("accepte un enseignant sur une promotion et refuse le doublon", () => {
    const input = {
      ...EMPTY_NEW_ACCESS_GRANT_INPUT,
      personId: "person-1",
      role: "teacher" as const,
      scopeKind: "cohort" as const,
      cohortId: "cohort-1",
      justification: "cours de la promotion",
    };
    expect(validateNewAccessGrant(input, { programId, existing: [] })).toEqual([]);

    const granted = buildAccessGrantFromInput(input, {
      programId,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(granted.scope).toEqual({ kind: "cohort", programId, cohortId: "cohort-1" });
    expect(validateNewAccessGrant(input, { programId, existing: [granted] })).toContain(
      "duplicate-grant",
    );
  });

  it("écarte les droits plateforme et les autres programmes", () => {
    const assignments = [
      {
        personId: "p1",
        role: "administrator",
        scope: { kind: "platform" },
        grantedAt: "2026-01-01T00:00:00.000Z",
        provenance: { sourceSystem: "native" },
      },
      {
        personId: "p2",
        role: "teacher",
        scope: { kind: "program", programId: "prog-autre" },
        grantedAt: "2026-01-01T00:00:00.000Z",
        provenance: { sourceSystem: "native" },
      },
      {
        personId: "p3",
        role: "teacher",
        scope: { kind: "program", programId },
        grantedAt: "2026-01-01T00:00:00.000Z",
        provenance: { sourceSystem: "native" },
      },
    ] as unknown as readonly RoleAssignment[];

    expect(grantsForProgram(assignments, programId).map((g) => g.personId)).toEqual(["p3"]);
  });
});
