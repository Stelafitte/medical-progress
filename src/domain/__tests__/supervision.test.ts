import { describe, expect, it } from "vitest";
import {
  bulkValidationRequiresSummaryReview,
  canConfirmRealCompetence,
  canSignPlacementReport,
  evaluateBulkValidation,
  isSupervisorOfEnrollment,
  realCompetenceRequiresHumanValidation,
  supervisedEnrollmentIds,
} from "../supervision";
import {
  canAccessLearnerSpace,
  canAccessPlatformAdministration,
  canAccessProgramAdministration,
  canAccessSupervision,
} from "../access";
import {
  scopedToProgram,
  nextCertificateStatus,
  platformAdminCanOpenLearnerFile,
} from "../administration";
import type { PlacementAssignment, Provenance, RoleAssignment } from "../types";

const provenance: Provenance = { sourceSystem: "native" };
const base = { createdAt: "2026-01-01T00:00:00Z", provenance };

const assignment = (patch: Partial<PlacementAssignment>): PlacementAssignment => ({
  ...base,
  id: "pas-1",
  placementId: "pla-1",
  enrollmentId: "enr-1",
  supervisorPersonId: "per-sup",
  startsOn: "2026-09-01T00:00:00Z",
  endsOn: "2026-10-01T00:00:00Z",
  status: "in_progress",
  ...patch,
});

const role = (patch: Partial<RoleAssignment>): RoleAssignment => ({
  personId: "per-1",
  role: "learner",
  scope: { kind: "platform" },
  grantedAt: "2026-01-01T00:00:00Z",
  provenance,
  ...patch,
});

describe("périmètre du responsable de stage", () => {
  const mine = assignment({});
  const other = assignment({
    id: "pas-2",
    enrollmentId: "enr-2",
    supervisorPersonId: "per-autre",
  });

  it("ne retient que les inscriptions de ses propres affectations", () => {
    expect(supervisedEnrollmentIds([mine, other], "per-sup")).toEqual(["enr-1"]);
    expect(isSupervisorOfEnrollment([mine, other], "per-sup", "enr-2")).toBe(false);
  });
});

describe("actions d'encadrement", () => {
  it("seul un validateur humain confirme une compétence réelle", () => {
    expect(canConfirmRealCompetence(["placement_supervisor"])).toBe(true);
    expect(canConfirmRealCompetence(["teacher"])).toBe(true);
    expect(canConfirmRealCompetence(["learner"])).toBe(false);
    expect(realCompetenceRequiresHumanValidation()).toBe(true);
  });

  it("seul le responsable de stage signe le bilan", () => {
    expect(canSignPlacementReport(["placement_supervisor"])).toBe(true);
    expect(canSignPlacementReport(["administrator"])).toBe(false);
  });

  it("aucune validation groupée silencieuse", () => {
    expect(bulkValidationRequiresSummaryReview()).toBe(true);
    const withoutReview = evaluateBulkValidation(["placement_supervisor"], {
      selectedLogIds: ["slog-1"],
      summaryReviewed: false,
    });
    expect(withoutReview.allowed).toBe(false);
    const reviewed = evaluateBulkValidation(["placement_supervisor"], {
      selectedLogIds: ["slog-1"],
      summaryReviewed: true,
    });
    expect(reviewed.allowed).toBe(true);
    expect(
      evaluateBulkValidation(["learner"], { selectedLogIds: ["slog-1"], summaryReviewed: true })
        .allowed,
    ).toBe(false);
  });
});

describe("accès par espace", () => {
  const learner = role({ scope: { kind: "cohort", programId: "prog-a", cohortId: "coh-a" } });
  const supervisorA = role({
    role: "placement_supervisor",
    scope: { kind: "placement", programId: "prog-a", placementId: "pla-1" },
  });
  const programAdminA = role({
    role: "administrator",
    scope: { kind: "program", programId: "prog-a" },
  });
  const platformAdmin = role({ role: "administrator", scope: { kind: "platform" } });

  it("chaque espace exige son rôle dans le programme sélectionné", () => {
    expect(canAccessLearnerSpace([learner], "prog-a")).toBe(true);
    expect(canAccessLearnerSpace([learner], "prog-b")).toBe(false);
    expect(canAccessSupervision([supervisorA], "prog-a")).toBe(true);
    expect(canAccessSupervision([supervisorA], "prog-b")).toBe(false);
    expect(canAccessProgramAdministration([programAdminA], "prog-a")).toBe(true);
    expect(canAccessProgramAdministration([programAdminA], "prog-b")).toBe(false);
  });

  it("l'administrateur de plateforme est un sur-ensemble de l'administrateur de programme", () => {
    expect(canAccessProgramAdministration([platformAdmin], "prog-a")).toBe(true);
    expect(canAccessPlatformAdministration([platformAdmin])).toBe(true);
    expect(canAccessPlatformAdministration([programAdminA])).toBe(false);
    expect(platformAdminCanOpenLearnerFile()).toBe(false);
  });

  it("un apprenant n'accède ni à l'encadrement ni à l'administration", () => {
    expect(canAccessSupervision([learner], "prog-a")).toBe(false);
    expect(canAccessProgramAdministration([learner], "prog-a")).toBe(false);
    expect(canAccessPlatformAdministration([learner])).toBe(false);
  });
});

describe("cloisonnement et workflow administratifs", () => {
  it("ne retient que les objets du programme", () => {
    const items = [{ programId: "prog-a" as const }, { programId: "prog-b" as const }];
    expect(scopedToProgram(items, "prog-a")).toHaveLength(1);
  });

  it("respecte les transitions du certificat de complétude", () => {
    expect(nextCertificateStatus("not_requested", "request")).toBe("requested");
    expect(nextCertificateStatus("requested", "sign")).toBe("signed");
    expect(nextCertificateStatus("signed", "validate")).toBe("validated");
    expect(nextCertificateStatus("not_requested", "sign")).toBeNull();
    expect(nextCertificateStatus("validated", "validate")).toBeNull();
  });
});
