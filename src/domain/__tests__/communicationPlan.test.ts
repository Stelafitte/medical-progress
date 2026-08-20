/**
 * Plan de communication : génération, décalages, modules désactivés,
 * modification manuelle, recalcul après changement de calendrier et
 * validation humaine obligatoire. Aucun envoi n'est possible depuis ce domaine.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PLAN_RULE_SET,
  activatePlan,
  addManualProposal,
  applyOffset,
  approveProposals,
  approvedProposals,
  describeOffset,
  editProposal,
  generateCommunicationPlan,
  generateProposals,
  proposalKey,
  reconcileCommunicationPlan,
  removeProposal,
  setProposalState,
  validatePlan,
  withOffsets,
  type PlanCalendar,
  type PlanCalendarStep,
  type PlanProgramKind,
} from "@/domain/communicationPlan";

const GEN = "2026-01-05T08:00:00.000Z";

function step(partial: Partial<PlanCalendarStep> & Pick<PlanCalendarStep, "id" | "kind">): PlanCalendarStep {
  return {
    label: partial.label ?? partial.id,
    startsAt: partial.startsAt ?? "2026-03-02T08:00:00.000Z",
    ...partial,
  } as PlanCalendarStep;
}

function calendar(overrides: Partial<PlanCalendar> = {}): PlanCalendar {
  return {
    implementationId: "impl-1",
    programId: "prog-1",
    programKind: "dpc",
    programTitle: "Programme démonstrateur",
    calendarVersion: "v1",
    timeZone: "Europe/Paris",
    modules: {
      enrollment: true,
      audit_a1: true,
      pre_test: true,
      in_person: true,
      post_test: true,
      audit_a2: true,
      completion: true,
    },
    steps: [
      step({ id: "s-enr", kind: "enrollment", label: "Inscription", startsAt: "2026-01-10T08:00:00.000Z", endsAt: "2026-02-10T18:00:00.000Z" }),
      step({ id: "s-a1", kind: "audit_a1", label: "Audit A1", startsAt: "2026-02-15T08:00:00.000Z", endsAt: "2026-03-01T18:00:00.000Z" }),
      step({ id: "s-pre", kind: "pre_test", label: "Pré-test", startsAt: "2026-03-02T08:00:00.000Z", endsAt: "2026-03-05T18:00:00.000Z" }),
      step({ id: "s-form", kind: "in_person", label: "Journée présentielle", startsAt: "2026-03-20T08:00:00.000Z", endsAt: "2026-03-20T17:00:00.000Z" }),
      step({ id: "s-post", kind: "post_test", label: "Post-test", startsAt: "2026-03-21T08:00:00.000Z", endsAt: "2026-03-25T18:00:00.000Z" }),
      step({ id: "s-a2", kind: "audit_a2", label: "Audit A2", startsAt: "2026-06-20T08:00:00.000Z", endsAt: "2026-07-05T18:00:00.000Z" }),
      step({ id: "s-fin", kind: "completion", label: "Attestation", startsAt: "2026-07-15T08:00:00.000Z" }),
    ],
    ...overrides,
  };
}

describe("décalages", () => {
  it("calcule J-15 avant l'ouverture", () => {
    const s = step({ id: "x", kind: "in_person", startsAt: "2026-03-20T08:00:00.000Z" });
    expect(applyOffset(s, "start", { kind: "days_before", days: 15 })).toBe(
      "2026-03-05T08:00:00.000Z",
    );
  });

  it("calcule le jour même, J+7 et le dépassement", () => {
    const s = step({ id: "x", kind: "audit_a1", startsAt: "2026-03-01T08:00:00.000Z", endsAt: "2026-03-10T08:00:00.000Z" });
    expect(applyOffset(s, "start", { kind: "same_day" })).toBe("2026-03-01T08:00:00.000Z");
    expect(applyOffset(s, "end", { kind: "days_after", days: 7 })).toBe("2026-03-17T08:00:00.000Z");
    expect(applyOffset(s, "end", { kind: "after_overdue", days: 3 })).toBe(
      "2026-03-13T08:00:00.000Z",
    );
  });

  it("retombe sur le début quand l'étape n'a pas de fin", () => {
    const s = step({ id: "x", kind: "completion", startsAt: "2026-07-15T08:00:00.000Z" });
    expect(applyOffset(s, "end", { kind: "same_day" })).toBe("2026-07-15T08:00:00.000Z");
  });

  it("ne calcule rien si l'ancre n'est pas datable", () => {
    const s = { id: "x", kind: "completion", label: "x", startsAt: "pas-une-date" } as PlanCalendarStep;
    expect(applyOffset(s, "start", { kind: "same_day" })).toBeUndefined();
  });

  it("décrit le décalage en clair", () => {
    expect(describeOffset({ kind: "days_before", days: 15 }, "start")).toContain("15 jour(s) avant");
    expect(describeOffset({ kind: "after_overdue", days: 7 }, "end")).toContain("dépassement");
  });

  it("laisse le coordinateur redéfinir un décalage", () => {
    const custom = withOffsets(DEFAULT_PLAN_RULE_SET, {
      in_person_convocation: { kind: "days_before", days: 30 },
    });
    const proposal = generateProposals(calendar(), custom).find(
      (p) => p.ruleId === "in_person_convocation",
    );
    expect(proposal?.scheduledAt).toBe("2026-02-18T08:00:00.000Z");
    expect(custom.version).toContain("+custom");
  });
});

describe("génération", () => {
  it("produit des propositions pour chaque étape activée, sans doublon", () => {
    const proposals = generateProposals(calendar());
    expect(proposals.length).toBeGreaterThan(10);
    expect(new Set(proposals.map(proposalKey)).size).toBe(proposals.length);
  });

  it("classe les propositions par date croissante", () => {
    const dates = generateProposals(calendar())
      .map((p) => p.scheduledAt)
      .filter((d): d is string => d !== undefined);
    expect([...dates].sort()).toEqual(dates);
  });

  it("ne génère aucun message pour un module désactivé", () => {
    const proposals = generateProposals(
      calendar({ modules: { enrollment: true, audit_a1: false, in_person: false } }),
    );
    expect(proposals.some((p) => p.milestoneRef === "s-a1")).toBe(false);
    expect(proposals.some((p) => p.milestoneRef === "s-form")).toBe(false);
    expect(proposals.some((p) => p.milestoneRef === "s-enr")).toBe(true);
  });

  it("génère un plan vide quand aucun module n'est activé", () => {
    expect(generateProposals(calendar({ modules: {} }))).toHaveLength(0);
  });

  it("propose systématiquement des brouillons non validés", () => {
    const plan = generateCommunicationPlan(calendar(), { generatedAt: GEN });
    expect(plan.status).toBe("draft");
    expect(plan.isSimulated).toBe(true);
    expect(plan.proposals.every((p) => p.state === "enabled")).toBe(true);
    expect(plan.proposals.every((p) => p.origin === "automatic_rule")).toBe(true);
  });

  it("conserve le fuseau du calendrier sur chaque proposition", () => {
    const plan = generateCommunicationPlan(calendar({ timeZone: "Indian/Reunion" }), {
      generatedAt: GEN,
    });
    expect(plan.timeZone).toBe("Indian/Reunion");
    expect(plan.proposals.every((p) => p.timeZone === "Indian/Reunion")).toBe(true);
  });

  it("expose un motif lisible et les variables requises", () => {
    const proposal = generateProposals(calendar())[0]!;
    expect(proposal.rationale).not.toBe("");
    expect(proposal.requiredVariables).toContain("firstName");
    expect(proposal.body).toContain("{{firstName}}");
  });

  it("fonctionne à l'identique pour DFASM, DIU et other", () => {
    for (const kind of ["dfasm", "diu", "other"] as readonly PlanProgramKind[]) {
      const plan = generateCommunicationPlan(calendar({ programKind: kind }), {
        generatedAt: GEN,
      });
      expect(plan.programKind).toBe(kind);
      expect(plan.proposals.length).toBeGreaterThan(0);
    }
  });

  it("marque comme non calculable une étape sans date exploitable", () => {
    const broken = calendar({
      modules: { completion: true },
      steps: [
        { id: "s-fin", kind: "completion", label: "Fin", startsAt: "date-invalide" } as PlanCalendarStep,
      ],
    });
    expect(generateProposals(broken).every((p) => p.scheduledAt === undefined)).toBe(true);
  });
});

describe("modification manuelle", () => {
  const base = generateCommunicationPlan(calendar(), { generatedAt: GEN });

  it("désactive et réactive une proposition", () => {
    const id = base.proposals[0]!.id;
    const off = setProposalState(base, id, "disabled");
    expect(off.proposals.find((p) => p.id === id)!.state).toBe("disabled");
    expect(setProposalState(off, id, "enabled").proposals.find((p) => p.id === id)!.state).toBe(
      "enabled",
    );
  });

  it("supprime une proposition", () => {
    const id = base.proposals[0]!.id;
    expect(removeProposal(base, id).proposals.some((p) => p.id === id)).toBe(false);
  });

  it("marque toute édition et trace la date fixée manuellement", () => {
    const id = base.proposals[0]!.id;
    const edited = editProposal(base, id, {
      subject: "Sujet réécrit",
      scheduledAt: "2026-02-01T09:00:00.000Z",
    });
    const proposal = edited.proposals.find((p) => p.id === id)!;
    expect(proposal.state).toBe("edited");
    expect(proposal.subject).toBe("Sujet réécrit");
    expect(proposal.rationale).toContain("manuellement");
  });

  it("ajoute un message libre d'origine manuelle sans doublon", () => {
    const withManual = addManualProposal(base, {
      id: "manual-1",
      milestoneRef: "s-enr",
      milestoneLabel: "Inscription",
      subject: "Message libre",
      body: "Contenu",
      audience: "all_participants",
      scheduledAt: "2026-01-15T08:00:00.000Z",
    });
    const created = withManual.proposals.find((p) => p.id === "manual-1")!;
    expect(created.origin).toBe("manual");
    expect(created.category).toBe("free");
    const twice = addManualProposal(withManual, {
      id: "manual-2",
      milestoneRef: "s-enr",
      milestoneLabel: "Inscription",
      subject: "Doublon",
      body: "Contenu",
      audience: "all_participants",
    });
    expect(twice.proposals.filter((p) => p.origin === "manual")).toHaveLength(1);
  });
});

describe("recalcul après modification du calendrier", () => {
  const base = generateCommunicationPlan(calendar(), { generatedAt: GEN });

  const moved = calendar({
    calendarVersion: "v2",
    steps: calendar().steps.map((s) =>
      s.id === "s-form"
        ? { ...s, startsAt: "2026-04-10T08:00:00.000Z", endsAt: "2026-04-10T17:00:00.000Z" }
        : s,
    ),
  });

  it("recalcule les dates et affiche les différences", () => {
    const result = reconcileCommunicationPlan(base, moved, { generatedAt: GEN });
    const diffs = result.differences.filter((d) => d.kind === "moved");
    expect(diffs.length).toBeGreaterThan(0);
    expect(result.nextPlan.calendarVersion).toBe("v2");
    expect(
      result.nextPlan.proposals.find((p) => p.ruleId === "in_person_convocation")!.scheduledAt,
    ).toBe("2026-03-26T08:00:00.000Z");
  });

  it("n'écrase jamais une proposition modifiée ou validée manuellement", () => {
    const id = base.proposals.find((p) => p.ruleId === "in_person_convocation")!.id;
    const edited = editProposal(base, id, { scheduledAt: "2026-02-01T09:00:00.000Z" });
    const result = reconcileCommunicationPlan(edited, moved, { generatedAt: GEN });
    expect(result.nextPlan.proposals.find((p) => p.id === id)!.scheduledAt).toBe(
      "2026-02-01T09:00:00.000Z",
    );
    expect(result.differences.some((d) => d.kind === "preserved" && d.proposalId === id)).toBe(true);
  });

  it("conserve l'état désactivé après recalcul", () => {
    const id = base.proposals.find((p) => p.ruleId === "in_person_eve")!.id;
    const result = reconcileCommunicationPlan(setProposalState(base, id, "disabled"), moved, {
      generatedAt: GEN,
    });
    expect(result.nextPlan.proposals.find((p) => p.id === id)!.state).toBe("disabled");
  });

  it("marque obsolètes les propositions d'une étape supprimée", () => {
    const shorter = calendar({
      calendarVersion: "v3",
      steps: calendar().steps.filter((s) => s.id !== "s-form"),
    });
    const result = reconcileCommunicationPlan(base, shorter, { generatedAt: GEN });
    expect(result.differences.some((d) => d.kind === "obsolete")).toBe(true);
    expect(
      result.nextPlan.proposals
        .filter((p) => p.milestoneRef === "s-form")
        .every((p) => p.state === "obsolete"),
    ).toBe(true);
  });

  it("signale les propositions ajoutées par une nouvelle étape", () => {
    const richer = calendar({
      calendarVersion: "v4",
      modules: { ...calendar().modules, e_learning: true },
      steps: [
        ...calendar().steps,
        step({
          id: "s-elearn",
          kind: "e_learning",
          label: "E-formation",
          startsAt: "2026-04-01T08:00:00.000Z",
          endsAt: "2026-05-01T08:00:00.000Z",
        }),
      ],
    });
    const result = reconcileCommunicationPlan(base, richer, { generatedAt: GEN });
    expect(result.differences.some((d) => d.kind === "added")).toBe(true);
  });

  it("détecte une proposition devenue incohérente faute de date", () => {
    const undated = calendar({
      calendarVersion: "v5",
      steps: calendar().steps.map((s) =>
        s.id === "s-form" ? ({ ...s, startsAt: "invalide", endsAt: undefined } as PlanCalendarStep) : s,
      ),
    });
    const result = reconcileCommunicationPlan(base, undated, { generatedAt: GEN });
    expect(result.differences.some((d) => d.kind === "incoherent")).toBe(true);
  });

  it("retire les propositions dont la règle ne s'applique plus", () => {
    const noAudit = calendar({
      calendarVersion: "v6",
      modules: { ...calendar().modules, audit_a2: false },
    });
    const result = reconcileCommunicationPlan(base, noAudit, { generatedAt: GEN });
    expect(result.differences.some((d) => d.kind === "removed")).toBe(true);
  });

  it("repasse un plan validé en « relu » après recalcul", () => {
    const activated = activatePlan(approveProposals(base, [base.proposals[0]!.id]));
    expect(activated.status).toBe("activated");
    expect(reconcileCommunicationPlan(activated, moved, { generatedAt: GEN }).nextPlan.status).toBe(
      "reviewed",
    );
  });

  it("ne produit jamais de doublon de clé après recalcul", () => {
    const result = reconcileCommunicationPlan(base, moved, { generatedAt: GEN });
    const keys = result.nextPlan.proposals.map(proposalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("validation humaine obligatoire", () => {
  const base = generateCommunicationPlan(calendar(), { generatedAt: GEN });

  it("refuse l'activation sans validation explicite", () => {
    const validation = validatePlan(base);
    expect(validation.canActivate).toBe(false);
    expect(validation.approvedCount).toBe(0);
    expect(validation.blockingReasons.join(" ")).toContain("validation humaine");
    expect(activatePlan(base).status).toBe("draft");
  });

  it("autorise l'activation après validation d'au moins une proposition", () => {
    const approved = approveProposals(base, [base.proposals[0]!.id]);
    expect(validatePlan(approved).canActivate).toBe(true);
    expect(activatePlan(approved).status).toBe("activated");
    expect(approvedProposals(approved)).toHaveLength(1);
  });

  it("ne valide jamais une proposition désactivée ou obsolète", () => {
    const id = base.proposals[0]!.id;
    const disabled = approveProposals(setProposalState(base, id, "disabled"), [id]);
    expect(disabled.proposals.find((p) => p.id === id)!.state).toBe("disabled");
    const obsolete = approveProposals(setProposalState(base, id, "obsolete"), [id]);
    expect(obsolete.proposals.find((p) => p.id === id)!.state).toBe("obsolete");
  });

  it("bloque l'activation si une proposition validée n'a pas de date", () => {
    const undated = generateCommunicationPlan(
      calendar({
        modules: { completion: true },
        steps: [
          { id: "s-fin", kind: "completion", label: "Fin", startsAt: "invalide" } as PlanCalendarStep,
        ],
      }),
      { generatedAt: GEN },
    );
    const approved = approveProposals(undated, [undated.proposals[0]!.id]);
    expect(validatePlan(approved).canActivate).toBe(false);
    expect(validatePlan(approved).blockingReasons.join(" ")).toContain("date");
  });

  it("bloque l'activation sans fuseau horaire", () => {
    const noTz = approveProposals({ ...base, timeZone: " " }, [base.proposals[0]!.id]);
    expect(validatePlan(noTz).blockingReasons.join(" ")).toContain("fuseau");
  });
});

describe("aucun envoi possible", () => {
  it("ne contient aucun appel réseau ni fournisseur de messagerie", () => {
    const source = readFileSync(
      new URL("../../../src/domain/communicationPlan.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "nodemailer",
      "sendMail",
      "setTimeout",
      "setInterval",
      "createServerFn",
      "supabase",
      "Date.now",
    ]) {
      expect(source.includes(forbidden), `interdit : ${forbidden}`).toBe(false);
    }
  });
});
