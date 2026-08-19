/**
 * Contrôle d'accès de l'écran « Personnes et inscriptions » :
 * réservé aux rôles disposant de l'administration DU programme, dans leur périmètre.
 */
import { describe, expect, it } from "vitest";
import { canAccessProgramAdministration } from "@/domain/access";
import type { RoleAssignment } from "@/domain/types";

const native = { sourceSystem: "native" as const };
const at = "2026-01-01T00:00:00.000Z";

function assignment(partial: Partial<RoleAssignment> & Pick<RoleAssignment, "role" | "scope">) {
  return { personId: "per-x", grantedAt: at, provenance: native, ...partial } as RoleAssignment;
}

describe("accès à la gestion des personnes et inscriptions", () => {
  it("autorise l'administrateur du programme concerné", () => {
    const roles = [
      assignment({ role: "administrator", scope: { kind: "program", programId: "prog-dfasm" } }),
    ];
    expect(canAccessProgramAdministration(roles, "prog-dfasm")).toBe(true);
  });

  it("refuse l'administrateur d'un autre programme", () => {
    const roles = [
      assignment({ role: "administrator", scope: { kind: "program", programId: "prog-diu" } }),
    ];
    expect(canAccessProgramAdministration(roles, "prog-dfasm")).toBe(false);
  });

  it("refuse un apprenant, un enseignant et un encadrant de stage", () => {
    const roles = [
      assignment({
        role: "learner",
        scope: { kind: "cohort", programId: "prog-dfasm", cohortId: "coh-dfasm" },
      }),
      assignment({ role: "teacher", scope: { kind: "program", programId: "prog-dfasm" } }),
      assignment({
        role: "placement_supervisor",
        scope: { kind: "placement", programId: "prog-dfasm", placementId: "pla-1" },
      }),
    ];
    expect(canAccessProgramAdministration(roles, "prog-dfasm")).toBe(false);
  });

  it("n'accorde pas l'accès implicite à un administrateur de plateforme", () => {
    const roles = [assignment({ role: "administrator", scope: { kind: "platform" } })];
    expect(canAccessProgramAdministration(roles, "prog-dfasm")).toBe(false);
  });
});
