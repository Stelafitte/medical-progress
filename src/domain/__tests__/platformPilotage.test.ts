/**
 * Contrats du pilotage plateforme : annuaire par groupe, édition de fiche,
 * paramétrage et courriel aux intervenants.
 */
import { describe, expect, it } from "vitest";
import {
  buildPlatformDirectory,
  groupPlatformDirectory,
  resolveNonLearnerRecipients,
  validatePersonEdit,
} from "../platformDirectory";
import {
  checkNonLearnerMailing,
  validateGeneralSettings,
  validateNotificationRule,
  validateProgramSettings,
} from "../platformSettings";
import type { Person, ProgramId, RoleAssignment } from "../types";

const PROGRAM = "prog-diu-echo" as ProgramId;

const people = [
  { id: "p1", fullName: "Alice Martin", email: "alice@chu.fr" },
  { id: "p2", fullName: "Bruno Lopez", email: "bruno@chu.fr" },
  { id: "p3", fullName: "Chloé Durand", email: "chloe@chu.fr" },
] as unknown as readonly Person[];

const roles = [
  { id: "r1", personId: "p1", role: "administrator", scope: { kind: "platform" }, reason: "x" },
  {
    id: "r2",
    personId: "p2",
    role: "administrator",
    scope: { kind: "program", programId: PROGRAM },
    reason: "x",
  },
  {
    id: "r3",
    personId: "p3",
    role: "learner",
    scope: { kind: "program", programId: PROGRAM },
    reason: "x",
  },
] as unknown as readonly RoleAssignment[];

describe("annuaire plateforme", () => {
  it("agrège les rôles contextualisés en groupes lisibles", () => {
    const rows = buildPlatformDirectory(people, roles);
    expect(rows).toHaveLength(3);
    const grouped = groupPlatformDirectory(rows);
    expect(grouped.platform_admin.map((r) => r.personId)).toEqual(["p1"]);
    expect(grouped.program_admin.map((r) => r.personId)).toEqual(["p2"]);
    expect(grouped.learner.map((r) => r.personId)).toEqual(["p3"]);
  });

  it("exclut les apprenants de l'audience intervenants", () => {
    const staff = resolveNonLearnerRecipients(buildPlatformDirectory(people, roles));
    expect(staff.map((r) => r.personId)).toEqual(["p1", "p2"]);
  });

  it("exige un motif et un courriel valide pour modifier une fiche", () => {
    expect(
      validatePersonEdit({
        fullName: "Alice Martin",
        email: "alice@chu.fr",
        status: "active",
        notifyByEmail: true,
        reason: "",
      }),
    ).toHaveLength(1);
    expect(
      validatePersonEdit({
        fullName: "Alice Martin",
        email: "alice",
        status: "suspended",
        notifyByEmail: false,
        reason: "changement d'adresse",
      }),
    ).toHaveLength(1);
    expect(
      validatePersonEdit({
        fullName: "Alice Martin",
        email: "alice@chu.fr",
        status: "suspended",
        notifyByEmail: false,
        reason: "départ du service",
      }),
    ).toEqual([]);
  });
});

describe("paramétrage plateforme", () => {
  const base = {
    platformName: "Campus Santé Augmenté",
    supportEmail: "support@campus.fr",
    retentionMonths: 60,
    requireHumanValidation: true,
    aiEnabled: false,
    storageQuotaGb: 100,
  };

  it("accepte un cadre général cohérent", () => {
    expect(validateGeneralSettings(base)).toEqual([]);
  });

  it("refuse de désactiver la validation humaine", () => {
    expect(validateGeneralSettings({ ...base, requireHumanValidation: false })).toHaveLength(1);
  });

  it("contrôle les quotas d'un programme", () => {
    expect(
      validateProgramSettings({
        programId: PROGRAM,
        learnerCap: 0,
        aiCreditQuota: -1,
        storageQuotaGb: 0,
        placementsEnabled: true,
        notificationsEnabled: true,
      }),
    ).toHaveLength(3);
  });

  it("interdit une alerte de quota IA vers les apprenants", () => {
    expect(
      validateNotificationRule({
        kind: "ai_quota_alert",
        channel: "email",
        cadence: "daily",
        audienceLabel: "Apprenants DIU",
      }),
    ).toHaveLength(1);
  });
});

describe("courriel aux intervenants", () => {
  it("bloque les apprenants comme destinataires", () => {
    const check = checkNonLearnerMailing(
      { subject: "Réunion", body: "Merci de confirmer votre présence.", groupKeys: ["learner"] },
      3,
    );
    expect(check.canPrepare).toBe(false);
  });

  it("bloque une donnée patient et le balisage exécutable", () => {
    const patient = checkNonLearnerMailing(
      {
        subject: "Dossier",
        body: "Patient Dupont, NIR 1 85 07 75 116 001 42, à revoir.",
        groupKeys: ["teacher"],
      },
      2,
    );
    expect(patient.canPrepare).toBe(false);

    const unsafe = checkNonLearnerMailing(
      { subject: "Info", body: "<script>alert(1)</script> bonjour", groupKeys: ["teacher"] },
      2,
    );
    expect(unsafe.canPrepare).toBe(false);
  });

  it("autorise un message simple vers des intervenants existants", () => {
    const check = checkNonLearnerMailing(
      {
        subject: "Réunion de coordination",
        body: "Réunion pédagogique jeudi à 18 h, merci de confirmer.",
        groupKeys: ["platform_admin", "program_admin"],
      },
      4,
    );
    expect(check.errors).toEqual([]);
    expect(check.canPrepare).toBe(true);
  });

  it("refuse un envoi sans destinataire résolu", () => {
    const check = checkNonLearnerMailing(
      { subject: "Réunion", body: "Message suffisamment long.", groupKeys: ["teacher"] },
      0,
    );
    expect(check.canPrepare).toBe(false);
  });
});
