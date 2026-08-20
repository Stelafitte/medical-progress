/**
 * PLAN DE COMMUNICATION généré automatiquement à partir d'un calendrier.
 *
 * Module GÉNÉRIQUE : DFASM, DIU, DPC ou tout autre programme configuré passent
 * par le même chemin. Le DPC HVG–Amylose n'est qu'un démonstrateur.
 *
 * Invariants :
 *  - module PUR : aucun I/O, aucune horloge implicite (`generatedAt` est
 *    toujours fourni par l'appelant), aucun réseau, aucun envoi ;
 *  - toute proposition est un BROUILLON soumis à validation humaine ;
 *  - une règle ne produit rien si le module correspondant est désactivé ;
 *  - aucun décalage n'est codé en dur comme règle universelle : les décalages
 *    appartiennent au jeu de règles, modifiable par le coordinateur ;
 *  - une proposition modifiée manuellement n'est JAMAIS écrasée par une
 *    régénération ;
 *  - aucun doublon (ruleId + milestoneRef + audience).
 */
import type { MessageCategory, MessageChannel } from "./communication";
import type { IsoDateTime } from "./types";

/* ------------------------------------------------------------------ */
/* 1. Calendrier générique d'entrée                                    */
/* ------------------------------------------------------------------ */

/** Type de programme : le mécanisme est identique pour tous. */
export type PlanProgramKind = "dfasm" | "diu" | "dpc" | "other";

/** Nature d'étape reconnue par les règles génériques. */
export type PlanStepKind =
  | "enrollment"
  | "audit_a1"
  | "in_person"
  | "virtual_classroom"
  | "e_learning"
  | "pre_test"
  | "post_test"
  | "audit_a2"
  | "completion";

export const PLAN_STEP_LABELS_FR: Record<PlanStepKind, string> = {
  enrollment: "Inscription",
  audit_a1: "Audit A1",
  in_person: "Formation présentielle",
  virtual_classroom: "Visioconférence",
  e_learning: "E-formation",
  pre_test: "Pré-test / post-test",
  post_test: "Post-test",
  audit_a2: "Audit A2",
  completion: "Fin de parcours",
};

/** Modules activables : une étape dont le module est éteint ne génère rien. */
export type PlanModuleKey = PlanStepKind;

export type PlanActiveModules = Readonly<Partial<Record<PlanModuleKey, boolean>>>;

export interface PlanCalendarStep {
  readonly id: string;
  readonly kind: PlanStepKind;
  readonly label: string;
  /** Début (ou ouverture). Absent = étape non encore datée : rien n'est généré. */
  readonly startsAt?: IsoDateTime;
  /** Fin (ou fermeture) éventuelle. */
  readonly endsAt?: IsoDateTime;
  readonly location?: string;
  readonly joinUrl?: string;
}

export interface PlanCalendar {
  readonly implementationId: string;
  readonly programId: string;
  readonly programKind: PlanProgramKind;
  readonly programTitle: string;
  /** Version du calendrier : toute modification doit l'incrémenter. */
  readonly calendarVersion: string;
  readonly timeZone: string;
  readonly modules: PlanActiveModules;
  readonly steps: readonly PlanCalendarStep[];
}

/* ------------------------------------------------------------------ */
/* 2. Décalages configurables                                          */
/* ------------------------------------------------------------------ */

export type PlanOffset =
  | { readonly kind: "days_before"; readonly days: number }
  | { readonly kind: "same_day" }
  | { readonly kind: "days_after"; readonly days: number }
  | { readonly kind: "after_overdue"; readonly days: number };

/** Point d'ancrage : début ou fin de l'étape. */
export type PlanAnchor = "start" | "end";

export function describeOffset(offset: PlanOffset, anchor: PlanAnchor): string {
  const ref = anchor === "start" ? "l'ouverture" : "la clôture";
  switch (offset.kind) {
    case "days_before":
      return `${offset.days} jour(s) avant ${ref}`;
    case "same_day":
      return `le jour même de ${ref}`;
    case "days_after":
      return `${offset.days} jour(s) après ${ref}`;
    case "after_overdue":
      return `${offset.days} jour(s) après dépassement de ${ref}`;
  }
}

const DAY_MS = 86_400_000;

/** Date calculée, déterministe. `undefined` si l'ancre n'est pas datée. */
export function applyOffset(
  step: PlanCalendarStep,
  anchor: PlanAnchor,
  offset: PlanOffset,
): IsoDateTime | undefined {
  const base = anchor === "end" ? (step.endsAt ?? step.startsAt) : step.startsAt;
  if (!base) return undefined;
  const ms = Date.parse(base);
  if (Number.isNaN(ms)) return undefined;
  switch (offset.kind) {
    case "days_before":
      return new Date(ms - offset.days * DAY_MS).toISOString();
    case "same_day":
      return new Date(ms).toISOString();
    case "days_after":
    case "after_overdue":
      return new Date(ms + offset.days * DAY_MS).toISOString();
  }
}

/* ------------------------------------------------------------------ */
/* 3. Règles                                                           */
/* ------------------------------------------------------------------ */

/** Audience générée : toujours dans le périmètre de l'implémentation. */
export type PlanAudienceKind =
  | "all_participants"
  | "incomplete_participants"
  | "submitted_participants"
  | "facilitators";

export const PLAN_AUDIENCE_LABELS_FR: Record<PlanAudienceKind, string> = {
  all_participants: "Tous les participants de la cohorte",
  incomplete_participants: "Participants incomplets",
  submitted_participants: "Participants ayant soumis",
  facilitators: "Intervenants",
};

export interface PlanRule {
  readonly id: string;
  readonly stepKind: PlanStepKind;
  /** Module requis : si désactivé, la règle ne génère rien. */
  readonly requiresModule: PlanModuleKey;
  readonly category: MessageCategory;
  /** Motif lisible affiché au coordinateur. */
  readonly purpose: string;
  readonly anchor: PlanAnchor;
  readonly offset: PlanOffset;
  readonly audience: PlanAudienceKind;
  readonly channel: MessageChannel;
  readonly subject: string;
  readonly body: string;
  readonly requiredVariables: readonly string[];
}

export interface PlanRuleSet {
  readonly version: string;
  readonly label: string;
  readonly rules: readonly PlanRule[];
}

const V = ["firstName", "programTitle", "accessLink", "coordinatorName"] as const;

function rule(
  id: string,
  stepKind: PlanStepKind,
  purpose: string,
  category: MessageCategory,
  anchor: PlanAnchor,
  offset: PlanOffset,
  audience: PlanAudienceKind,
  subject: string,
): PlanRule {
  return {
    id,
    stepKind,
    requiresModule: stepKind,
    category,
    purpose,
    anchor,
    offset,
    audience,
    channel: "email",
    subject,
    body:
      "Bonjour {{firstName}},\n\n" +
      `${purpose} — {{programTitle}}.\n` +
      "Accès : {{accessLink}}\n\n{{coordinatorName}}",
    requiredVariables: [...V],
  };
}

/**
 * Jeu de règles PAR DÉFAUT, entièrement modifiable. Les décalages ci-dessous
 * (15, 7, 2, 1 jours) sont une PROPOSITION pour le démonstrateur DPC, jamais
 * une règle universelle : `withOffsets` permet de les redéfinir.
 */
export const DEFAULT_PLAN_RULE_SET: PlanRuleSet = {
  version: "plan-rules-1.0.0",
  label: "Règles génériques proposées (modifiables)",
  rules: [
    // Inscription
    rule("enrollment_confirmation", "enrollment", "Confirmation d'inscription", "announcement", "start", { kind: "same_day" }, "all_participants", "{{programTitle}} — confirmation d'inscription"),
    rule("enrollment_welcome", "enrollment", "Message de bienvenue", "announcement", "start", { kind: "days_after", days: 1 }, "all_participants", "Bienvenue dans {{programTitle}}"),
    rule("enrollment_practical", "enrollment", "Informations pratiques", "announcement", "end", { kind: "days_before", days: 2 }, "all_participants", "{{programTitle}} — informations pratiques"),
    // Audit A1
    rule("a1_open", "audit_a1", "Ouverture de l'audit A1", "announcement", "start", { kind: "same_day" }, "all_participants", "Ouverture de l'audit A1 — {{programTitle}}"),
    rule("a1_reminder_before", "audit_a1", "Rappel avant échéance de l'audit A1", "reminder", "end", { kind: "days_before", days: 7 }, "all_participants", "Audit A1 — échéance proche"),
    rule("a1_reminder_incomplete", "audit_a1", "Rappel aux participants incomplets (A1)", "reminder", "end", { kind: "days_before", days: 2 }, "incomplete_participants", "Audit A1 incomplet — {{programTitle}}"),
    rule("a1_submission_confirmation", "audit_a1", "Confirmation de soumission A1", "announcement", "end", { kind: "same_day" }, "submitted_participants", "Audit A1 — soumission enregistrée"),
    rule("a1_feedback_available", "audit_a1", "Disponibilité de l'analyse personnalisée A1", "announcement", "end", { kind: "days_after", days: 7 }, "submitted_participants", "Votre analyse personnalisée A1 est disponible"),
    // Présentiel
    rule("in_person_convocation", "in_person", "Convocation à la formation présentielle", "convocation", "start", { kind: "days_before", days: 15 }, "all_participants", "Convocation — {{programTitle}}"),
    rule("in_person_place_time", "in_person", "Rappel avec lieu et horaires", "reminder", "start", { kind: "days_before", days: 7 }, "all_participants", "Lieu et horaires — {{programTitle}}"),
    rule("in_person_eve", "in_person", "Rappel la veille", "reminder", "start", { kind: "days_before", days: 1 }, "all_participants", "Demain — {{programTitle}}"),
    rule("in_person_change", "in_person", "Information pratique ou modification", "announcement", "start", { kind: "days_before", days: 2 }, "all_participants", "Information pratique — {{programTitle}}"),
    // Visioconférence
    rule("virtual_convocation", "virtual_classroom", "Convocation à la visioconférence", "convocation", "start", { kind: "days_before", days: 15 }, "all_participants", "Convocation visioconférence — {{programTitle}}"),
    rule("virtual_join_link", "virtual_classroom", "Lien de connexion", "announcement", "start", { kind: "days_before", days: 2 }, "all_participants", "Lien de connexion — {{programTitle}}"),
    rule("virtual_reminder", "virtual_classroom", "Rappel avant la séance", "reminder", "start", { kind: "days_before", days: 1 }, "all_participants", "Rappel séance en visioconférence"),
    rule("virtual_change", "virtual_classroom", "Information en cas de changement", "announcement", "start", { kind: "days_before", days: 7 }, "all_participants", "Modification de la séance — {{programTitle}}"),
    // E-formation
    rule("elearning_open", "e_learning", "Ouverture de l'accès", "announcement", "start", { kind: "same_day" }, "all_participants", "Votre e-formation est ouverte"),
    rule("elearning_reminder", "e_learning", "Rappel de consultation", "reminder", "end", { kind: "days_before", days: 15 }, "all_participants", "Pensez à consulter vos ressources"),
    rule("elearning_required_incomplete", "e_learning", "Relance des ressources obligatoires non terminées", "reminder", "end", { kind: "days_before", days: 7 }, "incomplete_participants", "Ressources obligatoires non terminées"),
    rule("elearning_closing", "e_learning", "Fermeture prochaine", "reminder", "end", { kind: "days_before", days: 2 }, "all_participants", "Fermeture prochaine de l'e-formation"),
    // Pré-test / post-test
    rule("pretest_open", "pre_test", "Ouverture du test", "announcement", "start", { kind: "same_day" }, "all_participants", "Ouverture du test — {{programTitle}}"),
    rule("pretest_reminder", "pre_test", "Rappel du test", "reminder", "end", { kind: "days_before", days: 2 }, "incomplete_participants", "Test à compléter — {{programTitle}}"),
    rule("pretest_completed", "pre_test", "Confirmation de complétude", "announcement", "end", { kind: "same_day" }, "submitted_participants", "Test complété — {{programTitle}}"),
    rule("posttest_open", "post_test", "Ouverture du post-test", "announcement", "start", { kind: "same_day" }, "all_participants", "Ouverture du post-test"),
    rule("posttest_reminder", "post_test", "Rappel du post-test", "reminder", "end", { kind: "days_before", days: 2 }, "incomplete_participants", "Post-test à compléter"),
    rule("posttest_completed", "post_test", "Confirmation de complétude du post-test", "announcement", "end", { kind: "same_day" }, "submitted_participants", "Post-test complété"),
    // Audit A2
    rule("a2_open", "audit_a2", "Annonce de l'ouverture de l'audit A2", "announcement", "start", { kind: "same_day" }, "all_participants", "Ouverture de l'audit A2"),
    rule("a2_reminder_before", "audit_a2", "Rappel avant clôture de l'audit A2", "reminder", "end", { kind: "days_before", days: 7 }, "all_participants", "Audit A2 — clôture proche"),
    rule("a2_reminder_incomplete", "audit_a2", "Relance des audits A2 incomplets", "reminder", "end", { kind: "days_before", days: 2 }, "incomplete_participants", "Audit A2 incomplet"),
    rule("a2_submission_confirmation", "audit_a2", "Confirmation de soumission A2", "announcement", "end", { kind: "same_day" }, "submitted_participants", "Audit A2 — soumission enregistrée"),
    rule("a2_synthesis_available", "audit_a2", "Disponibilité de la synthèse comparative", "announcement", "end", { kind: "days_after", days: 7 }, "submitted_participants", "Synthèse comparative disponible"),
    // Fin de parcours
    rule("completion_improvement_plan", "completion", "Plan d'amélioration disponible", "announcement", "start", { kind: "same_day" }, "all_participants", "Votre plan d'amélioration est disponible"),
    rule("completion_attestation", "completion", "Attestation disponible", "announcement", "start", { kind: "days_after", days: 2 }, "submitted_participants", "Votre attestation est disponible"),
    rule("completion_incomplete", "completion", "Parcours incomplet", "reminder", "start", { kind: "after_overdue", days: 7 }, "incomplete_participants", "Parcours incomplet — {{programTitle}}"),
    rule("completion_closing", "completion", "Message de clôture", "announcement", "end", { kind: "days_after", days: 1 }, "all_participants", "Clôture de {{programTitle}}"),
  ],
};

/** Redéfinition des décalages par le coordinateur (aucune valeur imposée). */
export function withOffsets(
  ruleSet: PlanRuleSet,
  overrides: Readonly<Record<string, PlanOffset>>,
  version = `${ruleSet.version}+custom`,
): PlanRuleSet {
  return {
    ...ruleSet,
    version,
    rules: ruleSet.rules.map((r) => (overrides[r.id] ? { ...r, offset: overrides[r.id]! } : r)),
  };
}

/* ------------------------------------------------------------------ */
/* 4. Plan et propositions                                             */
/* ------------------------------------------------------------------ */

export type PlanProposalState = "enabled" | "disabled" | "edited" | "approved" | "obsolete";

export const PLAN_PROPOSAL_STATE_LABELS_FR: Record<PlanProposalState, string> = {
  enabled: "Activée",
  disabled: "Désactivée",
  edited: "Modifiée",
  approved: "Validée",
  obsolete: "Obsolète",
};

export type PlanProposalOrigin = "automatic_rule" | "manual";

export interface CommunicationProposal {
  readonly id: string;
  /** Étape du calendrier à l'origine de la proposition. */
  readonly milestoneRef: string;
  readonly milestoneLabel: string;
  readonly ruleId: string;
  readonly category: MessageCategory;
  readonly audience: PlanAudienceKind;
  readonly channel: MessageChannel;
  readonly subject: string;
  readonly body: string;
  /** Date/heure calculée. `undefined` = proposition incohérente à corriger. */
  readonly scheduledAt?: IsoDateTime;
  readonly timeZone: string;
  readonly state: PlanProposalState;
  readonly requiredVariables: readonly string[];
  /** Justification de la date : décalage appliqué et ancre. */
  readonly rationale: string;
  readonly origin: PlanProposalOrigin;
}

export type CommunicationPlanStatus = "draft" | "reviewed" | "activated" | "obsolete";

export const COMMUNICATION_PLAN_STATUS_LABELS_FR: Record<CommunicationPlanStatus, string> = {
  draft: "Brouillon",
  reviewed: "Relu",
  activated: "Validé (simulation)",
  obsolete: "Obsolète",
};

export interface CommunicationPlan {
  readonly implementationId: string;
  readonly programId: string;
  readonly programKind: PlanProgramKind;
  readonly calendarVersion: string;
  readonly generatedAt: IsoDateTime;
  readonly generatedByRuleVersion: string;
  readonly timeZone: string;
  readonly proposals: readonly CommunicationProposal[];
  readonly status: CommunicationPlanStatus;
  /** Rappel structurel : rien n'est jamais expédié depuis ce modèle. */
  readonly isSimulated: true;
}

export const COMMUNICATION_PLAN_NO_SEND_FR =
  "Plan de communication simulé : chaque ligne est une proposition, aucun message n'est expédié.";

/** Clé d'unicité imposée : ruleId + étape + audience. */
export function proposalKey(proposal: {
  readonly ruleId: string;
  readonly milestoneRef: string;
  readonly audience: PlanAudienceKind;
}): string {
  return `${proposal.ruleId}::${proposal.milestoneRef}::${proposal.audience}`;
}

function isModuleActive(calendar: PlanCalendar, key: PlanModuleKey): boolean {
  return calendar.modules[key] === true;
}

/* ------------------------------------------------------------------ */
/* 5. Génération                                                       */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  readonly generatedAt: IsoDateTime;
  readonly ruleSet?: PlanRuleSet;
}

export function generateProposals(
  calendar: PlanCalendar,
  ruleSet: PlanRuleSet = DEFAULT_PLAN_RULE_SET,
): readonly CommunicationProposal[] {
  const seen = new Set<string>();
  const proposals: CommunicationProposal[] = [];

  for (const step of calendar.steps) {
    if (!isModuleActive(calendar, step.kind)) continue;
    for (const r of ruleSet.rules) {
      if (r.stepKind !== step.kind) continue;
      if (!isModuleActive(calendar, r.requiresModule)) continue;
      const key = proposalKey({ ruleId: r.id, milestoneRef: step.id, audience: r.audience });
      if (seen.has(key)) continue;
      seen.add(key);
      const at = applyOffset(step, r.anchor, r.offset);
      proposals.push({
        id: key,
        milestoneRef: step.id,
        milestoneLabel: step.label,
        ruleId: r.id,
        category: r.category,
        audience: r.audience,
        channel: r.channel,
        subject: r.subject,
        body: r.body,
        ...(at ? { scheduledAt: at } : {}),
        timeZone: calendar.timeZone,
        state: "enabled",
        requiredVariables: r.requiredVariables,
        rationale: `${r.purpose} — ${describeOffset(r.offset, r.anchor)} de « ${step.label} »`,
        origin: "automatic_rule",
      });
    }
  }

  return sortProposals(proposals);
}

export function sortProposals(
  proposals: readonly CommunicationProposal[],
): readonly CommunicationProposal[] {
  return [...proposals].sort((a, b) => {
    if (!a.scheduledAt && !b.scheduledAt) return a.id < b.id ? -1 : 1;
    if (!a.scheduledAt) return 1;
    if (!b.scheduledAt) return -1;
    const diff = Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
    return diff !== 0 ? diff : a.id < b.id ? -1 : 1;
  });
}

export function generateCommunicationPlan(
  calendar: PlanCalendar,
  options: GenerateOptions,
): CommunicationPlan {
  const ruleSet = options.ruleSet ?? DEFAULT_PLAN_RULE_SET;
  return {
    implementationId: calendar.implementationId,
    programId: calendar.programId,
    programKind: calendar.programKind,
    calendarVersion: calendar.calendarVersion,
    generatedAt: options.generatedAt,
    generatedByRuleVersion: ruleSet.version,
    timeZone: calendar.timeZone,
    proposals: generateProposals(calendar, ruleSet),
    status: "draft",
    isSimulated: true,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Édition manuelle                                                 */
/* ------------------------------------------------------------------ */

export function setProposalState(
  plan: CommunicationPlan,
  proposalId: string,
  state: PlanProposalState,
): CommunicationPlan {
  return {
    ...plan,
    proposals: plan.proposals.map((p) => (p.id === proposalId ? { ...p, state } : p)),
  };
}

export interface ProposalEdit {
  readonly subject?: string;
  readonly body?: string;
  readonly scheduledAt?: IsoDateTime;
  readonly audience?: PlanAudienceKind;
}

/** Toute édition manuelle marque la proposition : elle devient protégée. */
export function editProposal(
  plan: CommunicationPlan,
  proposalId: string,
  edit: ProposalEdit,
): CommunicationPlan {
  return {
    ...plan,
    proposals: sortProposals(
      plan.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              ...(edit.subject !== undefined ? { subject: edit.subject } : {}),
              ...(edit.body !== undefined ? { body: edit.body } : {}),
              ...(edit.scheduledAt !== undefined ? { scheduledAt: edit.scheduledAt } : {}),
              ...(edit.audience !== undefined ? { audience: edit.audience } : {}),
              state: p.state === "approved" ? "approved" : "edited",
              rationale:
                edit.scheduledAt !== undefined
                  ? `Date fixée manuellement par le coordinateur (${p.rationale})`
                  : p.rationale,
            }
          : p,
      ),
    ),
  };
}

/** Message libre ajouté par le coordinateur : origine `manual`, jamais écrasé. */
export function addManualProposal(
  plan: CommunicationPlan,
  input: {
    readonly id: string;
    readonly milestoneRef: string;
    readonly milestoneLabel: string;
    readonly subject: string;
    readonly body: string;
    readonly audience: PlanAudienceKind;
    readonly scheduledAt?: IsoDateTime;
  },
): CommunicationPlan {
  const proposal: CommunicationProposal = {
    id: input.id,
    milestoneRef: input.milestoneRef,
    milestoneLabel: input.milestoneLabel,
    ruleId: "manual",
    category: "free",
    audience: input.audience,
    channel: "email",
    subject: input.subject,
    body: input.body,
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    timeZone: plan.timeZone,
    state: "edited",
    requiredVariables: [],
    rationale: "Message libre ajouté manuellement",
    origin: "manual",
  };
  const key = proposalKey(proposal);
  if (plan.proposals.some((p) => proposalKey(p) === key && p.origin === "manual")) return plan;
  return { ...plan, proposals: sortProposals([...plan.proposals, proposal]) };
}

export function removeProposal(plan: CommunicationPlan, proposalId: string): CommunicationPlan {
  return { ...plan, proposals: plan.proposals.filter((p) => p.id !== proposalId) };
}

/* ------------------------------------------------------------------ */
/* 7. Recalcul après modification du calendrier                        */
/* ------------------------------------------------------------------ */

export type PlanDiffKind = "added" | "moved" | "removed" | "obsolete" | "incoherent" | "preserved";

export const PLAN_DIFF_LABELS_FR: Record<PlanDiffKind, string> = {
  added: "Ajoutée",
  moved: "Déplacée",
  removed: "Supprimée",
  obsolete: "Obsolète (étape supprimée)",
  incoherent: "Incohérente (date non calculable)",
  preserved: "Préservée (modifiée manuellement)",
};

export interface PlanDiffEntry {
  readonly kind: PlanDiffKind;
  readonly proposalId: string;
  readonly label: string;
  readonly previousAt?: IsoDateTime;
  readonly nextAt?: IsoDateTime;
  readonly detail: string;
}

export interface PlanReconciliation {
  readonly differences: readonly PlanDiffEntry[];
  /** Plan résultant, à appliquer seulement après revue humaine. */
  readonly nextPlan: CommunicationPlan;
}

/**
 * Recalcule les propositions AUTOMATIQUES depuis le nouveau calendrier :
 *  - une proposition éditée, validée ou manuelle est PRÉSERVÉE ;
 *  - une proposition liée à une étape disparue devient `obsolete` ;
 *  - une proposition sans date calculable est signalée `incoherent` ;
 *  - aucun doublon (ruleId + milestoneRef + audience).
 */
export function reconcileCommunicationPlan(
  plan: CommunicationPlan,
  calendar: PlanCalendar,
  options: GenerateOptions,
): PlanReconciliation {
  const ruleSet = options.ruleSet ?? DEFAULT_PLAN_RULE_SET;
  const regenerated = generateProposals(calendar, ruleSet);
  const byKeyNew = new Map(regenerated.map((p) => [proposalKey(p), p]));
  const stepIds = new Set(calendar.steps.map((s) => s.id));
  const differences: PlanDiffEntry[] = [];
  const result: CommunicationProposal[] = [];
  const handled = new Set<string>();

  for (const previous of plan.proposals) {
    const key = proposalKey(previous);
    handled.add(key);
    const protectedProposal =
      previous.origin === "manual" || previous.state === "edited" || previous.state === "approved";

    if (!stepIds.has(previous.milestoneRef)) {
      result.push({ ...previous, state: "obsolete" });
      differences.push({
        kind: "obsolete",
        proposalId: previous.id,
        label: previous.subject,
        ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
        detail: `L'étape « ${previous.milestoneLabel} » n'existe plus dans le calendrier.`,
      });
      continue;
    }

    const next = byKeyNew.get(key);
    if (!next) {
      if (protectedProposal) {
        result.push(previous);
        differences.push({
          kind: "preserved",
          proposalId: previous.id,
          label: previous.subject,
          ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
          detail: "Proposition modifiée ou validée manuellement : conservée telle quelle.",
        });
      } else {
        differences.push({
          kind: "removed",
          proposalId: previous.id,
          label: previous.subject,
          ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
          detail: "La règle ne s'applique plus à ce calendrier.",
        });
      }
      continue;
    }

    if (protectedProposal) {
      result.push(previous);
      differences.push({
        kind: "preserved",
        proposalId: previous.id,
        label: previous.subject,
        ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
        ...(next.scheduledAt ? { nextAt: next.scheduledAt } : {}),
        detail:
          "Modification manuelle protégée : le recalcul automatique ne l'écrase pas silencieusement.",
      });
      continue;
    }

    const merged: CommunicationProposal = { ...next, state: previous.state === "disabled" ? "disabled" : next.state };
    result.push(merged);

    if (!next.scheduledAt) {
      differences.push({
        kind: "incoherent",
        proposalId: next.id,
        label: next.subject,
        ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
        detail: "L'étape n'est plus datée : la date de cette proposition n'est pas calculable.",
      });
    } else if (previous.scheduledAt !== next.scheduledAt) {
      differences.push({
        kind: "moved",
        proposalId: next.id,
        label: next.subject,
        ...(previous.scheduledAt ? { previousAt: previous.scheduledAt } : {}),
        nextAt: next.scheduledAt,
        detail: "La date change avec le nouveau calendrier.",
      });
    }
  }

  for (const [key, proposal] of byKeyNew) {
    if (handled.has(key)) continue;
    result.push(proposal);
    differences.push({
      kind: "added",
      proposalId: proposal.id,
      label: proposal.subject,
      ...(proposal.scheduledAt ? { nextAt: proposal.scheduledAt } : {}),
      detail: "Nouvelle proposition issue du calendrier modifié.",
    });
  }

  const deduped: CommunicationProposal[] = [];
  const keys = new Set<string>();
  for (const proposal of sortProposals(result)) {
    const key = proposalKey(proposal);
    if (keys.has(key)) continue;
    keys.add(key);
    deduped.push(proposal);
  }

  return {
    differences,
    nextPlan: {
      ...plan,
      calendarVersion: calendar.calendarVersion,
      generatedAt: options.generatedAt,
      generatedByRuleVersion: ruleSet.version,
      timeZone: calendar.timeZone,
      proposals: deduped,
      status: plan.status === "activated" ? "reviewed" : plan.status,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 8. Validation humaine                                               */
/* ------------------------------------------------------------------ */

export interface PlanValidationResult {
  readonly canActivate: boolean;
  readonly blockingReasons: readonly string[];
  readonly approvedCount: number;
  readonly pendingCount: number;
}

/** Une proposition n'est retenue que si un humain l'a explicitement validée. */
export function validatePlan(plan: CommunicationPlan): PlanValidationResult {
  const considered = plan.proposals.filter((p) => p.state !== "disabled" && p.state !== "obsolete");
  const approved = considered.filter((p) => p.state === "approved");
  const pending = considered.filter((p) => p.state !== "approved");
  const reasons: string[] = [];
  if (approved.length === 0)
    reasons.push("Aucune proposition validée : la validation humaine est obligatoire.");
  if (approved.some((p) => !p.scheduledAt))
    reasons.push("Une proposition validée n'a pas de date calculable.");
  if (plan.timeZone.trim() === "")
    reasons.push("Le fuseau horaire est obligatoire : sans lui, aucune date n'est interprétable.");
  return {
    canActivate: reasons.length === 0,
    blockingReasons: reasons,
    approvedCount: approved.length,
    pendingCount: pending.length,
  };
}

export function approveProposals(
  plan: CommunicationPlan,
  proposalIds: readonly string[],
): CommunicationPlan {
  const ids = new Set(proposalIds);
  return {
    ...plan,
    proposals: plan.proposals.map((p) =>
      ids.has(p.id) && p.state !== "obsolete" && p.state !== "disabled"
        ? { ...p, state: "approved" }
        : p,
    ),
  };
}

/** Activation SIMULÉE : aucune tâche planifiée, aucun envoi, aucun ordonnanceur. */
export function activatePlan(plan: CommunicationPlan): CommunicationPlan {
  return validatePlan(plan).canActivate ? { ...plan, status: "activated" } : plan;
}

export function approvedProposals(
  plan: CommunicationPlan,
): readonly CommunicationProposal[] {
  return sortProposals(plan.proposals.filter((p) => p.state === "approved"));
}
