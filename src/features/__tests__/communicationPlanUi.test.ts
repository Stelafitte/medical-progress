/**
 * Contrats de l'écran « Plan de communication proposé » et de l'adaptateur de
 * calendrier : transversalité, absence d'envoi, validation humaine, diffs,
 * intégration à l'historique local et exigences mobiles.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calendarFromDpcImplementation,
  calendarFromGenericSteps,
  calendarFromScheduledSlots,
  toAudienceDefinition,
  toScheduleTrigger,
} from "@/application/communicationPlanSource";
import { generateCommunicationPlan } from "@/domain/communicationPlan";
import { DPC_WIZARD_STEPS } from "@/domain/dpcProgramDraft";
import { dpcHvgImplementations } from "@/infrastructure/mock/dpcImplementationFixtures";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const ui = read("src/features/administration/CommunicationPlanSection.tsx");
const adapter = read("src/application/communicationPlanSource.ts");
const wizard = read("src/features/administration/DpcProgramWizard.tsx");

describe("adaptateur de calendrier", () => {
  it("projette une implémentation DPC réelle du démonstrateur", () => {
    const implementation = dpcHvgImplementations[0]!;
    const calendar = calendarFromDpcImplementation(implementation, {
      programId: "prog-dpc",
      programTitle: "DPC HVG–Amylose",
    });
    expect(calendar.programKind).toBe("dpc");
    expect(calendar.timeZone).toBe(implementation.timeZone);
    expect(calendar.steps.length).toBeGreaterThan(0);
    const plan = generateCommunicationPlan(calendar, { generatedAt: "2026-01-01T00:00:00.000Z" });
    expect(plan.proposals.length).toBeGreaterThan(0);
    expect(plan.status).toBe("draft");
  });

  it("n'active aucun module absent du calendrier", () => {
    const calendar = calendarFromDpcImplementation(dpcHvgImplementations[0]!, {
      programId: "prog-dpc",
      programTitle: "DPC",
    });
    for (const [key, active] of Object.entries(calendar.modules)) {
      if (active) expect(calendar.steps.some((s) => s.kind === key)).toBe(true);
    }
  });

  it("accepte un calendrier générique DFASM ou DIU", () => {
    const calendar = calendarFromGenericSteps({
      implementationId: "impl-diu",
      programId: "prog-diu",
      programKind: "diu",
      programTitle: "DIU d'échocardiographie",
      calendarVersion: "v1",
      timeZone: "Europe/Paris",
      steps: [
        {
          id: "seance-1",
          kind: "virtual_classroom",
          label: "Séance inaugurale",
          startsAt: "2026-10-01T17:00:00.000Z",
        },
      ],
    });
    const plan = generateCommunicationPlan(calendar, { generatedAt: "2026-01-01T00:00:00.000Z" });
    expect(plan.programKind).toBe("diu");
    expect(plan.proposals.some((p) => p.ruleId === "virtual_convocation")).toBe(true);
  });

  it("mappe les créneaux de l'assistant : premier tour d'audit en A1, suivant en A2", () => {
    const calendar = calendarFromScheduledSlots({
      implementationId: "impl-1",
      programId: "prog-1",
      programKind: "dpc",
      programTitle: "Démonstrateur",
      calendarVersion: "v1",
      timeZone: "Europe/Paris",
      slots: [
        { id: "t1", label: "Tour 1", kind: "audit_round", order: 1, startsAt: "2026-02-01T08:00:00.000Z" },
        { id: "t2", label: "Tour 2", kind: "audit_round", order: 2, startsAt: "2026-06-01T08:00:00.000Z" },
        { id: "f1", label: "Visio", kind: "training_session", delivery: "virtual_classroom", startsAt: "2026-03-01T17:00:00.000Z" },
      ],
    });
    expect(calendar.steps.map((s) => s.kind)).toEqual(["audit_a1", "audit_a2", "virtual_classroom"]);
  });

  it("ignore les créneaux non datés", () => {
    const calendar = calendarFromScheduledSlots({
      implementationId: "impl-1",
      programId: "prog-1",
      programKind: "other",
      programTitle: "Autre",
      calendarVersion: "v1",
      timeZone: "Europe/Paris",
      slots: [{ id: "x", label: "Sans date", kind: "pre_test" }],
    });
    expect(calendar.steps).toHaveLength(0);
  });

  it("traduit les audiences dans le périmètre du programme", () => {
    expect(toAudienceDefinition("all_participants", "s-1")).toEqual({ kind: "program_all" });
    expect(toAudienceDefinition("incomplete_participants", "s-1")).toEqual({
      kind: "milestone_incomplete",
      milestoneId: "s-1",
    });
    expect(toAudienceDefinition("facilitators", "s-1")).toEqual({
      kind: "contextual_role",
      role: "teacher",
    });
  });

  it("produit un déclencheur daté et fuseau explicite", () => {
    expect(toScheduleTrigger("2026-03-01T08:00:00.000Z", "Europe/Paris")).toEqual({
      kind: "at",
      at: "2026-03-01T08:00:00.000Z",
      timeZone: "Europe/Paris",
    });
    expect(toScheduleTrigger(undefined, "Europe/Paris")).toEqual({ kind: "immediate" });
  });
});

describe("intégration à l'assistant d'implémentation", () => {
  it("insère l'étape après le calendrier et avant le contrôle final", () => {
    const ids = DPC_WIZARD_STEPS.map((s) => s.id);
    expect(ids.indexOf("communication_plan")).toBe(ids.indexOf("implementation_schedule") + 1);
    expect(ids.indexOf("publication_check")).toBe(ids.indexOf("communication_plan") + 1);
    expect(DPC_WIZARD_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("rend la section depuis le calendrier réel de l'assistant", () => {
    expect(wizard).toContain('stepId === "communication_plan"');
    expect(wizard).toContain("<CommunicationPlanSection");
    expect(wizard).toContain("calendarFromScheduledSlots({");
    expect(wizard).toContain("slots: plan.slots");
  });
});

describe("interface du plan proposé", () => {
  it("affiche le plan, son statut et les compteurs de validation", () => {
    expect(ui).toContain("Plan de communication proposé");
    expect(ui).toContain("COMMUNICATION_PLAN_STATUS_LABELS_FR");
    expect(ui).toContain("validation.approvedCount");
    expect(ui).toContain("validation.pendingCount");
  });

  it("permet d'activer, modifier, prévisualiser, valider et supprimer chaque proposition", () => {
    for (const label of [
      "Désactiver",
      "Modifier",
      "Prévisualiser",
      "Valider cette proposition",
      "Supprimer",
    ]) {
      expect(ui).toContain(label);
    }
    expect(ui).toContain("editProposal");
    expect(ui).toContain("setProposalState");
    expect(ui).toContain("removeProposal");
    expect(ui).toContain("approveProposals");
  });

  it("expose le motif, l'audience et le fuseau de chaque proposition", () => {
    expect(ui).toContain("PLAN_AUDIENCE_LABELS_FR[proposal.audience]");
    expect(ui).toContain("proposal.rationale");
    expect(ui).toContain("proposal.timeZone");
  });

  it("affiche les différences avant d'appliquer un recalcul", () => {
    expect(ui).toContain("reconcileCommunicationPlan");
    expect(ui).toContain("Recalculer depuis le calendrier");
    expect(ui).toContain("Différences avant application");
    expect(ui).toContain("PLAN_DIFF_LABELS_FR");
    expect(ui).toContain("Appliquer le recalcul");
  });

  it("autorise l'ajout d'un message libre marqué manuel", () => {
    expect(ui).toContain("addManualProposal");
    expect(ui).toContain("Ajouter un message libre");
    expect(ui).toContain("jamais écrasé par un recalcul");
  });

  it("n'active le plan qu'après validation humaine et transmet à l'historique local", () => {
    expect(ui).toContain("validatePlan");
    expect(ui).toContain("disabled={!validation.canActivate}");
    expect(ui).toContain("Valider le plan de communication (simulation)");
    expect(ui).toContain("addPreparedCampaign");
    expect(ui).toContain('dispatchStatus: "pending"');
    expect(ui).toContain("Validation humaine obligatoire.");
  });
});

describe("absence d'envoi réel", () => {
  it("ne contient aucun appel réseau ni ordonnanceur dans l'écran et l'adaptateur", () => {
    for (const source of [ui, adapter]) {
      for (const forbidden of [
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "nodemailer",
        "sendMail",
        "setInterval",
        "createServerFn",
        "supabase",
      ]) {
        expect(source.includes(forbidden), `interdit : ${forbidden}`).toBe(false);
      }
    }
  });

  it("annonce explicitement la simulation", () => {
    expect(ui).toContain("COMMUNICATION_PLAN_NO_SEND_FR");
    expect(ui).toContain("Simulé — aucun envoi");
    expect(ui).toContain("perdu au");
  });
});

describe("mobile et accessibilité", () => {
  it("garantit des cibles tactiles de 44 px, des libellés et des zones vivantes", () => {
    expect(ui).toContain('const TOUCH = "min-h-11"');
    expect(ui).toContain("<Label htmlFor=");
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('role="alert"');
    expect(ui).toContain("sm:grid-cols-2");
    expect(ui).toContain("flex-wrap");
  });
});
