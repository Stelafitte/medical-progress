import { describe, expect, it } from "vitest";
import { canAccessAdministration, canAccessOwnProfile } from "../access";
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

const learnerA = assignment({
  role: "learner",
  scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-a" },
});
const learnerB = assignment({
  role: "learner",
  scope: { kind: "cohort", programId: "prog-b", cohortId: "coh-b" },
});
const adminA = assignment({ role: "administrator", scope: { kind: "program", programId: "prog-a" } });
const platformAdmin = assignment({ role: "administrator", scope: { kind: "platform" } });
const teacherA = assignment({ role: "teacher", scope: { kind: "program", programId: "prog-a" } });

describe("accès à l'administration", () => {
  it("un apprenant, même inscrit dans plusieurs programmes, n'a jamais accès", () => {
    expect(canAccessAdministration([learnerA, learnerB], "prog-a")).toBe(false);
    expect(canAccessAdministration([learnerA, learnerB], "prog-b")).toBe(false);
  });

  it("un administrateur de programme n'a accès que dans son programme", () => {
    expect(canAccessAdministration([adminA], "prog-a")).toBe(true);
    expect(canAccessAdministration([adminA], "prog-b")).toBe(false);
  });

  it("le changement de programme recalcule le droit", () => {
    const roles = [learnerA, adminA];
    const visibility = ["prog-a", "prog-b"].map((p) => canAccessAdministration(roles, p));
    expect(visibility).toEqual([true, false]);
  });

  it("un administrateur plateforme a accès dans tous les programmes", () => {
    expect(canAccessAdministration([platformAdmin], "prog-a")).toBe(true);
    expect(canAccessAdministration([platformAdmin], "prog-b")).toBe(true);
  });

  it("un enseignant n'est pas administrateur", () => {
    expect(canAccessAdministration([teacherA], "prog-a")).toBe(false);
  });
});

describe("accès au profil", () => {
  it("est ouvert à tout utilisateur authentifié, quels que soient ses rôles", () => {
    expect(canAccessOwnProfile(true)).toBe(true);
    expect(canAccessOwnProfile(false)).toBe(false);
  });
});
