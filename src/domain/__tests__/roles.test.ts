import { describe, expect, it } from "vitest";
import {
  canValidateEvidence,
  hasRole,
  isRoleScopeConsistent,
  rolesInContext,
  scopeCovers,
} from "../roles";
import type { Provenance, RoleAssignment } from "../types";

const provenance: Provenance = { sourceSystem: "native" };

const assignment = (patch: Partial<RoleAssignment>): RoleAssignment => ({
  personId: "per-1",
  role: "learner",
  scope: { kind: "platform" },
  grantedAt: "2026-01-01T00:00:00Z",
  provenance,
  ...patch,
});

describe("rôles contextualisés", () => {
  it("un rôle de programme ne s'applique pas à un autre programme", () => {
    const teacher = assignment({
      role: "teacher",
      scope: { kind: "program", programId: "prog-a" },
    });
    expect(hasRole([teacher], "teacher", { programId: "prog-a" })).toBe(true);
    expect(hasRole([teacher], "teacher", { programId: "prog-b" })).toBe(false);
  });

  it("un encadrant de stage n'est encadrant que sur son stage", () => {
    const supervisor = assignment({
      role: "placement_supervisor",
      scope: { kind: "placement", programId: "prog-a", placementId: "pla-1" },
    });
    expect(canValidateEvidence([supervisor], { programId: "prog-a", placementId: "pla-1" })).toBe(
      true,
    );
    expect(canValidateEvidence([supervisor], { programId: "prog-a", placementId: "pla-2" })).toBe(
      false,
    );
    expect(canValidateEvidence([supervisor], { programId: "prog-a" })).toBe(false);
  });

  it("un apprenant ne peut jamais valider une preuve", () => {
    const learner = assignment({
      scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-1" },
    });
    expect(canValidateEvidence([learner], { programId: "prog-a", cohortId: "coh-1" })).toBe(false);
  });

  it("un rôle de cohorte ne s'applique pas à une autre cohorte du même programme", () => {
    const learner = assignment({
      scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-1" },
    });
    expect(scopeCovers(learner, { programId: "prog-a", cohortId: "coh-2" })).toBe(false);
    expect(scopeCovers(learner, { programId: "prog-a", cohortId: "coh-1" })).toBe(true);
  });

  it("la portée plateforme couvre tous les contextes", () => {
    const admin = assignment({ role: "administrator", scope: { kind: "platform" } });
    expect(canValidateEvidence([admin], { programId: "prog-z", placementId: "pla-9" })).toBe(true);
  });

  it("liste les rôles effectifs dans un contexte donné", () => {
    const assignments = [
      assignment({ scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-1" } }),
      assignment({ role: "teacher", scope: { kind: "program", programId: "prog-b" } }),
    ];
    expect(rolesInContext(assignments, { programId: "prog-a", cohortId: "coh-1" })).toEqual([
      "learner",
    ]);
  });
});

describe("isRoleScopeConsistent", () => {
  it("un encadrant de stage exige une portée stage", () => {
    expect(
      isRoleScopeConsistent(
        assignment({
          role: "placement_supervisor",
          scope: { kind: "placement", programId: "prog-a", placementId: "pla-1" },
        }),
      ),
    ).toBe(true);
    expect(
      isRoleScopeConsistent(
        assignment({ role: "placement_supervisor", scope: { kind: "platform" } }),
      ),
    ).toBe(false);
  });

  it("enseignant et apprenant exigent un programme ou une cohorte", () => {
    for (const role of ["teacher", "learner"] as const) {
      expect(
        isRoleScopeConsistent(
          assignment({ role, scope: { kind: "program", programId: "prog-a" } }),
        ),
      ).toBe(true);
      expect(
        isRoleScopeConsistent(
          assignment({
            role,
            scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-1" },
          }),
        ),
      ).toBe(true);
      expect(isRoleScopeConsistent(assignment({ role, scope: { kind: "platform" } }))).toBe(false);
    }
  });

  it("un administrateur est plateforme ou programme, jamais stage", () => {
    expect(
      isRoleScopeConsistent(assignment({ role: "administrator", scope: { kind: "platform" } })),
    ).toBe(true);
    expect(
      isRoleScopeConsistent(
        assignment({ role: "administrator", scope: { kind: "program", programId: "prog-a" } }),
      ),
    ).toBe(true);
    expect(
      isRoleScopeConsistent(
        assignment({
          role: "administrator",
          scope: { kind: "placement", programId: "prog-a", placementId: "pla-1" },
        }),
      ),
    ).toBe(false);
  });
});
