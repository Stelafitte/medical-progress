import { describe, expect, it } from "vitest";
import {
  ALLOWED_VARIABLES,
  canApproveCampaign,
  canSchedule,
  containsUnsafeMarkup,
  extractVariables,
  previewCampaign,
  renderForRecipient,
  resolveAudience,
  scanPatientData,
  scheduleCampaign,
  type ActorScope,
  type CommMessageTemplate,
  type CommunicationCampaign,
  type CommunicationPreference,
  type CommunicationSnapshot,
  type ScheduleTrigger,
} from "../communication";
import type { DirectoryRow } from "../directory";
import type { EnrollmentStatus } from "../directory";
import type { ProgramId, RoleName } from "../types";

/* ---------------------------------------------------------------- */
/* Fabriques de test (aucune fixture réelle)                         */
/* ---------------------------------------------------------------- */

function row(
  id: string,
  name: string,
  cohortId: string,
  options: {
    status?: EnrollmentStatus;
    roles?: readonly RoleName[];
    email?: string;
  } = {},
): DirectoryRow {
  return {
    enrollment: {
      id: `enr-${id}-${cohortId}`,
      personId: id,
      programId: "prog-1",
      cohortId,
      status: options.status ?? "active",
      origin: "fixture",
      enrolledAt: "2026-01-01T00:00:00.000Z",
    },
    person: {
      id,
      firstName: name.split(" ")[0] ?? name,
      lastName: name.split(" ").slice(1).join(" "),
      origin: "fixture",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    fullName: name,
    email: options.email ?? `${id}@example.test`,
    accountStatus: "active",
    cohortLabel: `Promotion ${cohortId}`,
    cohortLifecycle: "active",
    roles: options.roles ?? ["learner"],
  };
}

function snapshot(overrides: Partial<CommunicationSnapshot> = {}): CommunicationSnapshot {
  return {
    programId: "prog-1",
    programTitle: "DIU d'Échocardiographie",
    coordinatorName: "Dr Coordination",
    rows: [
      row("p1", "Alice Martin", "c1"),
      row("p2", "Bruno Petit", "c1"),
      row("p3", "Chloé Durand", "c2"),
      row("p4", "David Retiré", "c1", { status: "withdrawn" }),
      row("p5", "Emma Encadrante", "c1", { roles: ["placement_supervisor"] }),
    ],
    groups: [{ groupId: "g1", label: "Groupe A", personIds: ["p1", "p3", "pX"] }],
    milestones: [
      {
        milestoneId: "m1",
        title: "Audit T0",
        completedPersonIds: ["p1"],
        dueAt: "2026-02-01T00:00:00.000Z",
      },
    ],
    nextDeadlineByPerson: { p1: "2026-03-01T00:00:00.000Z", p2: "2026-03-02T00:00:00.000Z" },
    accessLink: "https://campus.example.test/espace",
    ...overrides,
  };
}

const scope: ActorScope = {
  actorPersonId: "admin-1",
  role: "administrator",
  programIds: ["prog-1"],
};

const noPrefs: readonly CommunicationPreference[] = [];

/* ---------------------------------------------------------------- */
/* 1. Résolution d'audience                                          */
/* ---------------------------------------------------------------- */

describe("resolveAudience", () => {
  it("cible une cohorte entière sans les autres cohortes", () => {
    const r = resolveAudience({ kind: "cohort", cohortId: "c1" }, snapshot(), scope, noPrefs);
    expect(r.recipients.map((x) => x.personId)).toEqual(["p1", "p2", "p5"]);
    expect(r.blocking).toBe(false);
  });

  it("cible tout un programme", () => {
    const r = resolveAudience({ kind: "program_all" }, snapshot(), scope, noPrefs);
    expect(r.recipientCount).toBe(4);
  });

  it("cible des personnes sélectionnées", () => {
    const r = resolveAudience(
      { kind: "persons", personIds: ["p1", "p3"] },
      snapshot(),
      scope,
      noPrefs,
    );
    expect(r.recipients.map((x) => x.personId)).toEqual(["p1", "p3"]);
  });

  it("signale les personnes inconnues d'un groupe", () => {
    const r = resolveAudience({ kind: "group", groupId: "g1" }, snapshot(), scope, noPrefs);
    expect(r.recipientCount).toBe(2);
    expect(r.outOfScope.some((e) => e.reason === "unknown_person")).toBe(true);
  });

  it("applique un filtre dynamique", () => {
    const r = resolveAudience(
      { kind: "dynamic_filter", filter: { search: "alice" } },
      snapshot(),
      scope,
      noPrefs,
    );
    expect(r.recipients.map((x) => x.personId)).toEqual(["p1"]);
  });

  it("cible une étape incomplète", () => {
    const r = resolveAudience(
      { kind: "milestone_incomplete", milestoneId: "m1" },
      snapshot(),
      scope,
      noPrefs,
    );
    expect(r.recipients.map((x) => x.personId)).toEqual(["p2", "p3", "p5"]);
  });

  it("cible les retardataires à une date de référence", () => {
    const r = resolveAudience(
      { kind: "overdue", asOf: "2026-03-01T00:00:00.000Z", milestoneId: "m1" },
      snapshot(),
      scope,
      noPrefs,
    );
    expect(r.recipients.map((x) => x.personId)).toEqual(["p2", "p3", "p5"]);
  });

  it("cible un rôle contextuel", () => {
    const r = resolveAudience(
      { kind: "contextual_role", role: "placement_supervisor" },
      snapshot(),
      scope,
      noPrefs,
    );
    expect(r.recipients.map((x) => x.personId)).toEqual(["p5"]);
  });

  it("déduplique par personId", () => {
    const snap = snapshot({
      rows: [row("p1", "Alice Martin", "c1"), row("p1", "Alice Martin", "c2")],
    });
    const r = resolveAudience({ kind: "program_all" }, snap, scope, noPrefs);
    expect(r.recipientCount).toBe(1);
    expect(r.duplicatesRemoved).toEqual(["p1"]);
  });

  it("exclut les inscriptions withdrawn par défaut", () => {
    const r = resolveAudience({ kind: "program_all" }, snapshot(), scope, noPrefs);
    expect(r.recipients.some((x) => x.personId === "p4")).toBe(false);
    expect(r.withdrawn.map((x) => x.personId)).toEqual(["p4"]);
  });

  it("applique les préférences d'opt-out du canal", () => {
    const prefs: CommunicationPreference[] = [
      {
        personId: "p1",
        channel: "email",
        optedOut: true,
        source: "learner",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const r = resolveAudience({ kind: "program_all" }, snapshot(), scope, prefs);
    expect(r.optedOut.map((x) => x.personId)).toEqual(["p1"]);
    expect(r.recipients.some((x) => x.personId === "p1")).toBe(false);
  });

  it("bloque une audience hors périmètre programme", () => {
    const other: ActorScope = { ...scope, programIds: ["prog-2" as ProgramId] };
    const r = resolveAudience({ kind: "program_all" }, snapshot(), other, noPrefs);
    expect(r.blocking).toBe(true);
    expect(r.recipientCount).toBe(0);
  });

  it("bloque une cohorte hors périmètre de l'émetteur", () => {
    const limited: ActorScope = { ...scope, cohortIds: ["c1"] };
    const r = resolveAudience({ kind: "cohort", cohortId: "c2" }, snapshot(), limited, noPrefs);
    expect(r.blocking).toBe(true);
  });

  it("signale une audience vide", () => {
    const r = resolveAudience({ kind: "persons", personIds: [] }, snapshot(), scope, noPrefs);
    expect(r.recipientCount).toBe(0);
    expect(r.blocking).toBe(true);
    expect(r.warnings.some((w) => w.includes("Audience vide"))).toBe(true);
  });

  it("fonctionne identiquement pour DFASM, DIU, DPC et other", () => {
    for (const title of ["DFASM Cardiologie", "DIU Écho", "DPC HVG–Amylose", "Autre programme"]) {
      const r = resolveAudience(
        { kind: "cohort", cohortId: "c1" },
        snapshot({ programTitle: title }),
        scope,
        noPrefs,
      );
      expect(r.recipientCount).toBe(3);
    }
  });
});

/* ---------------------------------------------------------------- */
/* 2. Variables                                                      */
/* ---------------------------------------------------------------- */

describe("variables", () => {
  const snap = snapshot();
  const recipient = {
    personId: "p1",
    fullName: "Alice Martin",
    email: "p1@example.test",
    cohortId: "c1",
    cohortLabel: "Promotion c1",
  };

  it("n'autorise que la liste blanche", () => {
    expect([...ALLOWED_VARIABLES]).toEqual([
      "firstName",
      "lastName",
      "programTitle",
      "cohortTitle",
      "nextDeadline",
      "milestoneTitle",
      "accessLink",
      "coordinatorName",
    ]);
  });

  it("rend les variables valides", () => {
    const p = renderForRecipient(
      "Bonjour {{firstName}}",
      "{{lastName}} — {{programTitle}} / {{cohortTitle}} / {{nextDeadline}} / {{accessLink}} / {{coordinatorName}}",
      { recipient, snapshot: snap, milestoneTitle: "Audit T0" },
    );
    expect(p.valid).toBe(true);
    expect(p.subject).toBe("Bonjour Alice");
    expect(p.body).toContain("DIU d'Échocardiographie");
  });

  it("refuse une variable inconnue", () => {
    const p = renderForRecipient("x", "{{salaire}}", { recipient, snapshot: snap });
    expect(p.valid).toBe(false);
    expect(p.issues[0]?.kind).toBe("unknown_variable");
  });

  it("refuse une variable non résolue", () => {
    const p = renderForRecipient("x", "{{milestoneTitle}}", { recipient, snapshot: snap });
    expect(p.issues[0]?.kind).toBe("unresolved_variable");
  });

  it("refuse une variable liée à un patient", () => {
    const p = renderForRecipient("x", "{{patientName}}", { recipient, snapshot: snap });
    expect(p.issues[0]?.kind).toBe("patient_variable");
  });

  it("refuse une valeur contenant du HTML ou du script", () => {
    const p = renderForRecipient("x", "{{firstName}}", {
      recipient: { ...recipient, fullName: "<script>alert(1)</script> Martin" },
      snapshot: snap,
    });
    expect(p.issues[0]?.kind).toBe("unsafe_value");
    expect(containsUnsafeMarkup("<b>x</b>")).toBe(true);
    expect(containsUnsafeMarkup("texte simple")).toBe(false);
  });

  it("extrait les variables citées", () => {
    expect(extractVariables("{{firstName}} {{firstName}} {{lastName}}")).toEqual([
      "firstName",
      "lastName",
    ]);
  });
});

/* ---------------------------------------------------------------- */
/* 3. Données patients                                               */
/* ---------------------------------------------------------------- */

describe("scanPatientData", () => {
  it("ne signale rien sur un texte neutre", () => {
    expect(scanPatientData("Convocation", "Séance de simulation lundi.").verdict).toBe("none");
  });

  it("bloque sur un marqueur identifiant", () => {
    const scan = scanPatientData("Dossier", "Merci d'indiquer le nir du cas.");
    expect(scan.verdict).toBe("blocking");
    expect(scan.disclaimerFr).toContain("relecture humaine");
  });

  it("avertit sur un marqueur non strictement identifiant", () => {
    expect(scanPatientData("Merci d'indiquer votre prénom", "corps").verdict).toBe("warning");
  });
});

/* ---------------------------------------------------------------- */
/* 4. Approbation et planification                                   */
/* ---------------------------------------------------------------- */

const NOW = "2026-02-01T00:00:00.000Z";

function campaignOf(overrides: Partial<CommunicationCampaign> = {}): CommunicationCampaign {
  return {
    id: "camp-1",
    programId: "prog-1",
    channel: "email",
    audience: { kind: "cohort", cohortId: "c1" },
    subject: "Convocation {{firstName}}",
    body: "Bonjour, rendez-vous pour {{programTitle}}.",
    status: "pending_approval",
    createdBy: "admin-1",
    maxRecipients: 100,
    requiresCollectiveConfirmation: false,
    ...overrides,
  };
}

function approvalOf(
  campaign: CommunicationCampaign,
  trigger: ScheduleTrigger = { kind: "immediate" },
  extra: { template?: CommMessageTemplate; prefs?: readonly CommunicationPreference[] } = {},
) {
  const snap = snapshot();
  const resolution = resolveAudience(campaign.audience, snap, scope, extra.prefs ?? noPrefs);
  const previews = previewCampaign(campaign, resolution, snap);
  const patientScan = scanPatientData(campaign.subject, campaign.body);
  return canApproveCampaign({
    campaign,
    resolution,
    previews,
    patientScan,
    actorScope: scope,
    template: extra.template,
    trigger,
    now: NOW,
  });
}

describe("canApproveCampaign", () => {
  it("approuve une campagne conforme", () => {
    expect(approvalOf(campaignOf()).canApprove).toBe(true);
  });

  it("refuse un auteur hors périmètre", () => {
    const campaign = campaignOf({ programId: "prog-9" });
    const snap = snapshot();
    const resolution = resolveAudience(campaign.audience, snap, scope, noPrefs);
    const result = canApproveCampaign({
      campaign,
      resolution,
      previews: previewCampaign(campaign, resolution, snap),
      patientScan: scanPatientData(campaign.subject, campaign.body),
      actorScope: scope,
      trigger: { kind: "immediate" },
      now: NOW,
    });
    expect(result.canApprove).toBe(false);
    expect(result.checks.find((c) => c.id === "actor_in_scope")?.satisfied).toBe(false);
  });

  it("refuse un dépassement de plafond", () => {
    const r = approvalOf(campaignOf({ maxRecipients: 2 }));
    expect(r.checks.find((c) => c.id === "recipient_cap")?.satisfied).toBe(false);
    expect(r.canApprove).toBe(false);
  });

  it("exige la confirmation collective quand requise", () => {
    const missing = approvalOf(campaignOf({ requiresCollectiveConfirmation: true }));
    expect(missing.checks.find((c) => c.id === "collective_confirmation")?.satisfied).toBe(false);
    const confirmed = approvalOf(
      campaignOf({ requiresCollectiveConfirmation: true, collectiveConfirmationAt: NOW }),
    );
    expect(confirmed.canApprove).toBe(true);
  });

  it("exige un modèle validé lorsqu'un modèle est utilisé", () => {
    const draftTemplate: CommMessageTemplate = {
      id: "tpl-1",
      programId: null,
      category: "convocation",
      allowedChannels: ["email"],
      subject: "s",
      body: "b",
      declaredVariables: ["firstName"],
      version: 1,
      provenance: { sourceSystem: "native" },
      status: "draft",
    };
    const campaign = campaignOf({ templateId: "tpl-1" });
    expect(
      approvalOf(campaign, { kind: "immediate" }, { template: draftTemplate }).canApprove,
    ).toBe(false);
    expect(
      approvalOf(
        campaign,
        { kind: "immediate" },
        { template: { ...draftTemplate, status: "validated" } },
      ).canApprove,
    ).toBe(true);
  });

  it("exige un fuseau horaire pour tout déclenchement temporel", () => {
    const r = approvalOf(campaignOf(), {
      kind: "at",
      at: "2026-03-01T08:00:00.000Z",
      timeZone: "",
    });
    expect(r.checks.find((c) => c.id === "trigger_time_zone")?.satisfied).toBe(false);
  });

  it("refuse une date programmée passée", () => {
    const r = approvalOf(campaignOf(), {
      kind: "at",
      at: "2026-01-01T08:00:00.000Z",
      timeZone: "Europe/Paris",
    });
    expect(r.checks.find((c) => c.id === "future_schedule")?.satisfied).toBe(false);
  });

  it("accepte un déclenchement relatif avec fuseau", () => {
    const r = approvalOf(campaignOf(), { kind: "before_due", days: 3, timeZone: "Europe/Paris" });
    expect(r.canApprove).toBe(true);
  });

  it("refuse un marqueur patient bloquant", () => {
    const r = approvalOf(campaignOf({ body: "Merci d'indiquer l'ipp du cas." }));
    expect(r.checks.find((c) => c.id === "no_patient_marker")?.satisfied).toBe(false);
  });

  it("refuse une audience bloquée ou vide", () => {
    const r = approvalOf(campaignOf({ audience: { kind: "persons", personIds: [] } }));
    expect(r.checks.find((c) => c.id === "audience_resolved")?.satisfied).toBe(false);
  });

  it("refuse un contenu injecté", () => {
    const r = approvalOf(campaignOf({ body: "<script>alert(1)</script>" }));
    expect(r.checks.find((c) => c.id === "content_valid")?.satisfied).toBe(false);
  });

  it("vérifie qu'aucun opt-out ne reste dans la liste finale", () => {
    const prefs: CommunicationPreference[] = [
      {
        personId: "p1",
        channel: "email",
        optedOut: true,
        source: "learner",
        updatedAt: NOW,
      },
    ];
    const r = approvalOf(campaignOf(), { kind: "immediate" }, { prefs });
    expect(r.checks.find((c) => c.id === "no_opted_out_recipient")?.satisfied).toBe(true);
  });
});

describe("planification", () => {
  it("interdit de planifier une campagne non approuvée", () => {
    const draft = campaignOf({ status: "pending_approval" });
    expect(canSchedule(draft)).toBe(false);
    const result = scheduleCampaign(draft);
    expect(result.rejected).toBe(true);
    expect(result.campaign.status).toBe("pending_approval");
  });

  it("autorise la planification d'une campagne approuvée", () => {
    const approved = campaignOf({ status: "approved", approvedBy: "admin-1" });
    expect(canSchedule(approved)).toBe(true);
    expect(scheduleCampaign(approved).campaign.status).toBe("scheduled");
  });
});

/* ---------------------------------------------------------------- */
/* 5. Garanties structurelles                                        */
/* ---------------------------------------------------------------- */

describe("garanties du module", () => {
  it("ne contient ni envoi réel ni appel réseau", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../communication.ts", import.meta.url), "utf8"),
    );
    for (const forbidden of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "localStorage",
      "sessionStorage",
      "nodemailer",
      "sendMail",
      "Date.now(",
      "new Date(",
    ]) {
      expect(source.includes(forbidden), `interdit : ${forbidden}`).toBe(false);
    }
  });
});
