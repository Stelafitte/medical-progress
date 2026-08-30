import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURE_FLAGS,
  isEmailDomainAllowed,
  validateAuditExport,
  validateFeatureFlags,
  validateMaintenance,
  validateRetentionPolicy,
  validateRoleDelegation,
  validateSecurityPolicy,
  type AuditExportDraft,
  type DataRetentionPolicy,
  type PlatformSecurityPolicy,
  type RoleDelegationDraft,
} from "@/domain/platformGovernance";
import type { ProgramId } from "@/domain/types";

const SECURITY: PlatformSecurityPolicy = {
  mfaRequiredForAdmins: true,
  sessionTimeoutMinutes: 60,
  passwordMinLength: 14,
  allowedEmailDomains: ["univ-bordeaux.fr"],
  logPersonFileAccess: true,
};

const RETENTION: DataRetentionPolicy = {
  evidenceMonths: 60,
  auditMonths: 72,
  mediaMonths: 36,
  purgeAfterExport: false,
  dpoEmail: "dpo@campus.fr",
};

const DELEGATION: RoleDelegationDraft = {
  personId: "per-admin",
  role: "administrator",
  scope: "program",
  programId: "prg-diu" as ProgramId,
  reason: "Remplacement du coordinateur pendant son congé.",
  expiresOn: "2026-12-31",
};

const EXPORT: AuditExportDraft = {
  scope: "platform",
  fromDate: "2026-01-01",
  toDate: "2026-06-30",
  includeIdentities: false,
  reason: "Contrôle de conformité annuel.",
};

describe("sécurité plateforme", () => {
  it("accepte une politique conforme", () => {
    expect(validateSecurityPolicy(SECURITY)).toHaveLength(0);
  });

  it("refuse de désactiver le double facteur ou la journalisation", () => {
    expect(validateSecurityPolicy({ ...SECURITY, mfaRequiredForAdmins: false })).not.toHaveLength(
      0,
    );
    expect(validateSecurityPolicy({ ...SECURITY, logPersonFileAccess: false })).not.toHaveLength(0);
  });

  it("borne la session et la longueur du mot de passe", () => {
    expect(validateSecurityPolicy({ ...SECURITY, sessionTimeoutMinutes: 2 })).not.toHaveLength(0);
    expect(validateSecurityPolicy({ ...SECURITY, sessionTimeoutMinutes: 600 })).not.toHaveLength(0);
    expect(validateSecurityPolicy({ ...SECURITY, passwordMinLength: 8 })).not.toHaveLength(0);
  });

  it("filtre les domaines de courriel", () => {
    expect(isEmailDomainAllowed("a@univ-bordeaux.fr", ["univ-bordeaux.fr"])).toBe(true);
    expect(isEmailDomainAllowed("a@gmail.com", ["univ-bordeaux.fr"])).toBe(false);
    expect(isEmailDomainAllowed("a@gmail.com", [])).toBe(true);
  });
});

describe("conservation des données", () => {
  it("accepte une politique conforme", () => {
    expect(validateRetentionPolicy(RETENTION)).toHaveLength(0);
  });

  it("refuse un audit purgé avant les preuves", () => {
    expect(validateRetentionPolicy({ ...RETENTION, auditMonths: 40 })).not.toHaveLength(0);
  });

  it("exige un contact de protection des données valide", () => {
    expect(validateRetentionPolicy({ ...RETENTION, dpoEmail: "dpo" })).not.toHaveLength(0);
  });
});

describe("délégations de rôles", () => {
  it("accepte une délégation motivée et bornée", () => {
    expect(validateRoleDelegation(DELEGATION, "2026-08-25")).toHaveLength(0);
  });

  it("refuse une portée plateforme hors administrateur", () => {
    expect(
      validateRoleDelegation({ ...DELEGATION, scope: "platform", role: "teacher" }, "2026-08-25"),
    ).not.toHaveLength(0);
  });

  it("exige un motif et une échéance future", () => {
    expect(
      validateRoleDelegation({ ...DELEGATION, reason: "court" }, "2026-08-25"),
    ).not.toHaveLength(0);
    expect(
      validateRoleDelegation({ ...DELEGATION, expiresOn: "2026-08-01" }, "2026-08-25"),
    ).not.toHaveLength(0);
  });
});

describe("fonctionnalités par programme", () => {
  it("refuse le tuteur IA si l'IA est coupée au niveau plateforme", () => {
    expect(
      validateFeatureFlags(
        { ...DEFAULT_FEATURE_FLAGS, ai_tutor: true },
        { aiEnabledPlatformWide: false },
      ),
    ).not.toHaveLength(0);
  });

  it("refuse l'auto-déclaration sans carnet de stage", () => {
    expect(
      validateFeatureFlags(
        { ...DEFAULT_FEATURE_FLAGS, self_declaration: true, stage_logbook: false },
        { aiEnabledPlatformWide: true },
      ),
    ).not.toHaveLength(0);
  });

  it("accepte la configuration par défaut", () => {
    expect(
      validateFeatureFlags(DEFAULT_FEATURE_FLAGS, { aiEnabledPlatformWide: false }),
    ).toHaveLength(0);
  });
});

describe("maintenance", () => {
  it("exige un message en mode lecture seule", () => {
    expect(
      validateMaintenance({ readOnlyMode: true, bannerMessage: "", windowLabel: "" }),
    ).not.toHaveLength(0);
  });

  it("refuse un balisage exécutable", () => {
    expect(
      validateMaintenance({
        readOnlyMode: false,
        bannerMessage: "<script>alert(1)</script>",
        windowLabel: "",
      }),
    ).not.toHaveLength(0);
  });

  it("accepte un bandeau sobre", () => {
    expect(
      validateMaintenance({
        readOnlyMode: true,
        bannerMessage: "Maintenance programmée ce soir pendant une heure.",
        windowLabel: "12/09 22h",
      }),
    ).toHaveLength(0);
  });
});

describe("exports d'audit", () => {
  it("accepte un export anonymisé motivé", () => {
    expect(validateAuditExport(EXPORT)).toHaveLength(0);
  });

  it("exige un motif détaillé pour un export nominatif", () => {
    expect(
      validateAuditExport({ ...EXPORT, includeIdentities: true, reason: "Contrôle annuel." }),
    ).not.toHaveLength(0);
  });

  it("exige une période cohérente et une cible", () => {
    expect(
      validateAuditExport({ ...EXPORT, fromDate: "2026-07-01", toDate: "2026-01-01" }),
    ).not.toHaveLength(0);
    expect(validateAuditExport({ ...EXPORT, scope: "program" })).not.toHaveLength(0);
  });
});
