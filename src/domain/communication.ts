/**
 * COMMUNICATIONS — domaine générique, pur et déterministe.
 *
 * Ce module est TRANSVERSAL : il ignore volontairement DFASM, DIU, DPC ou tout
 * autre type de programme. Il ne connaît qu'un « instantané » de périmètre
 * (`CommunicationSnapshot`) fourni par la couche application.
 *
 * GARANTIES STRUCTURELLES (vérifiées par les tests) :
 * - AUCUN envoi réel : ce module ne contient aucun client e-mail / SMS / push ;
 * - AUCUN appel réseau : pas de `fetch`, `XMLHttpRequest`, `WebSocket`, `import()` ;
 * - AUCUNE persistance : pas de stockage, pas de mutation globale, pas d'horloge
 *   implicite (toute date « maintenant » est passée en paramètre) ;
 * - AUCUN secret, AUCUNE tâche planifiée : `ScheduledMessage` décrit une
 *   intention, jamais une exécution.
 *
 * LEGACY : `MessageTemplate` et `SendHistoryItem` de `./administration` sont
 * conservés (écrans existants). Ils sont considérés OBSOLÈTES et adaptés ici via
 * `adaptLegacyMessageTemplate` / `adaptLegacySendHistoryItem` afin d'éviter une
 * migration brutale. Aucun nouvel écran ne doit les utiliser.
 */
import type {
  MessageTemplate as LegacyMessageTemplate,
  SendHistoryItem as LegacySendHistoryItem,
} from "./administration";
import type { DirectoryFilter, DirectoryRow, EnrollmentStatus } from "./directory";
import { filterDirectoryRows } from "./directory";
import { detectPatientDataMarkers } from "./dpcProgramDraft";
import type {
  CohortId,
  Id,
  IsoDateTime,
  PersonId,
  ProgramId,
  Provenance,
  RoleName,
} from "./types";

/* ------------------------------------------------------------------ */
/* 1. Identifiants et libellés                                         */
/* ------------------------------------------------------------------ */

export type CommTemplateId = Id<"CommMessageTemplate">;
export type CommCampaignId = Id<"CommunicationCampaign">;
export type ScheduledMessageId = Id<"ScheduledMessage">;
export type ImplementationId = Id<"Implementation">;

export const COMMUNICATION_NO_REAL_SEND_FR =
  "Domaine de préparation uniquement : aucun message n'est expédié par ce module.";

/* ------------------------------------------------------------------ */
/* 2. Modèles                                                          */
/* ------------------------------------------------------------------ */

export type MessageChannel = "email" | "in_app" | "sms";

export type MessageCategory = "announcement" | "reminder" | "convocation" | "free";

export const MESSAGE_CATEGORY_LABELS_FR: Record<MessageCategory, string> = {
  announcement: "annonce",
  reminder: "relance",
  convocation: "convocation",
  free: "message libre",
};

export type TemplateStatus = "draft" | "validated" | "archived";

export interface CommMessageTemplate {
  readonly id: CommTemplateId;
  /** `null` = modèle de plateforme, réutilisable par tous les programmes. */
  readonly programId: ProgramId | null;
  readonly category: MessageCategory;
  readonly allowedChannels: readonly MessageChannel[];
  readonly subject: string;
  readonly body: string;
  /** Variables déclarées par le modèle (doivent être autorisées). */
  readonly declaredVariables: readonly string[];
  readonly version: number;
  readonly provenance: Provenance;
  readonly status: TemplateStatus;
}

export type AudienceDefinition =
  | { readonly kind: "program_all" }
  | { readonly kind: "cohort"; readonly cohortId: CohortId }
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "persons"; readonly personIds: readonly PersonId[] }
  | { readonly kind: "contextual_role"; readonly role: RoleName; readonly cohortId?: CohortId }
  | { readonly kind: "dynamic_filter"; readonly filter: DirectoryFilter }
  | { readonly kind: "milestone_incomplete"; readonly milestoneId: string }
  | { readonly kind: "overdue"; readonly asOf: IsoDateTime; readonly milestoneId?: string };

export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled";

export interface CommunicationCampaign {
  readonly id: CommCampaignId;
  readonly programId: ProgramId;
  readonly implementationId?: ImplementationId | undefined;
  readonly templateId?: CommTemplateId | undefined;
  readonly channel: MessageChannel;
  readonly audience: AudienceDefinition;
  /** Sujet et corps RENDUS (variables encore sous forme `{{...}}`). */
  readonly subject: string;
  readonly body: string;
  readonly status: CampaignStatus;
  readonly createdBy: PersonId;
  readonly approvedBy?: PersonId | undefined;
  /** Plafond de destinataires : garde-fou anti-envoi massif accidentel. */
  readonly maxRecipients: number;
  /** Un envoi collectif exige une confirmation explicite de l'émetteur. */
  readonly requiresCollectiveConfirmation: boolean;
  readonly collectiveConfirmationAt?: IsoDateTime | undefined;
}

export type ScheduleTrigger =
  | { readonly kind: "immediate" }
  | { readonly kind: "at"; readonly at: IsoDateTime; readonly timeZone: string }
  | {
      readonly kind: "recurring";
      readonly startAt: IsoDateTime;
      readonly timeZone: string;
      readonly everyDays: number;
      readonly occurrences: number;
    }
  | { readonly kind: "before_due"; readonly days: number; readonly timeZone: string }
  | { readonly kind: "after_overdue"; readonly days: number; readonly timeZone: string }
  | { readonly kind: "on_step_open"; readonly stepId: string }
  | { readonly kind: "on_enrollment" };

export type ScheduledMessageStatus = "pending" | "cancelled" | "dispatched";

export interface ScheduledMessage {
  readonly id: ScheduledMessageId;
  readonly campaignId: CommCampaignId;
  readonly trigger: ScheduleTrigger;
  readonly status: ScheduledMessageStatus;
  /** Rappel : aucun ordonnanceur n'existe ; ceci décrit une intention. */
  readonly isSimulated: true;
}

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled"
  | "suppressed";

export interface DeliveryAttempt {
  readonly campaignId: CommCampaignId;
  readonly personId: PersonId;
  readonly channel: MessageChannel;
  readonly status: DeliveryStatus;
  readonly attemptNumber: number;
  readonly failureReason?: string | undefined;
  readonly at: IsoDateTime;
}

export type PreferenceSource = "learner" | "administrator" | "import" | "bounce";

export interface CommunicationPreference {
  readonly personId: PersonId;
  readonly channel: MessageChannel;
  readonly optedOut: boolean;
  readonly source: PreferenceSource;
  readonly updatedAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* 3. Adaptateurs LEGACY (transition, à retirer après migration)       */
/* ------------------------------------------------------------------ */

/** @deprecated Adapte l'ancien `MessageTemplate` administratif vers le socle. */
export function adaptLegacyMessageTemplate(
  legacy: LegacyMessageTemplate,
  options: { readonly programId: ProgramId | null; readonly provenance: Provenance },
): CommMessageTemplate {
  return {
    id: legacy.id as CommTemplateId,
    programId: options.programId,
    category: "free",
    allowedChannels: ["email"],
    subject: legacy.label,
    body: legacy.body,
    declaredVariables: [],
    version: 1,
    provenance: options.provenance,
    status: "draft",
  };
}

/** @deprecated Adapte un historique « préparé, non envoyé » en tentative annulée. */
export function adaptLegacySendHistoryItem(legacy: LegacySendHistoryItem): DeliveryAttempt {
  return {
    campaignId: legacy.id as CommCampaignId,
    personId: "" as PersonId,
    channel: "email",
    status: "cancelled",
    attemptNumber: 0,
    failureReason: "historique legacy : préparé sans expédition",
    at: legacy.preparedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Instantané de périmètre et périmètre de l'émetteur               */
/* ------------------------------------------------------------------ */

export interface MilestoneSnapshot {
  readonly milestoneId: string;
  readonly title: string;
  /** Personnes AYANT achevé le jalon (les autres sont « incomplètes »). */
  readonly completedPersonIds: readonly PersonId[];
  readonly dueAt?: IsoDateTime | undefined;
}

export interface GroupSnapshot {
  readonly groupId: string;
  readonly label: string;
  readonly personIds: readonly PersonId[];
}

export interface CommunicationSnapshot {
  readonly programId: ProgramId;
  readonly programTitle: string;
  readonly coordinatorName: string;
  /** Lignes d'annuaire du programme UNIQUEMENT (cf. selectProgramDirectory). */
  readonly rows: readonly DirectoryRow[];
  readonly groups: readonly GroupSnapshot[];
  readonly milestones: readonly MilestoneSnapshot[];
  /** Échéance à venir par personne, si connue (variable `nextDeadline`). */
  readonly nextDeadlineByPerson?: Readonly<Record<string, IsoDateTime>> | undefined;
  readonly accessLink?: string | undefined;
}

/** Périmètre effectif de l'émetteur : jamais toute la plateforme. */
export interface ActorScope {
  readonly actorPersonId: PersonId;
  readonly role: RoleName;
  readonly programIds: readonly ProgramId[];
  /** `undefined` = toutes les cohortes du programme autorisé. */
  readonly cohortIds?: readonly CohortId[] | undefined;
}

/** Statuts d'inscription destinataires PAR DÉFAUT (`withdrawn` exclu). */
const DEFAULT_ELIGIBLE_STATUSES: readonly EnrollmentStatus[] = [
  "active",
  "suspended",
  "completed",
];

/* ------------------------------------------------------------------ */
/* 5. Résolution d'audience                                            */
/* ------------------------------------------------------------------ */

export interface ResolvedRecipient {
  readonly personId: PersonId;
  readonly fullName: string;
  readonly email: string;
  readonly cohortId: CohortId;
  readonly cohortLabel: string;
}

export interface ExcludedRecipient {
  readonly personId: PersonId;
  readonly reason:
    | "opted_out"
    | "out_of_scope"
    | "withdrawn"
    | "duplicate"
    | "unknown_person";
}

export interface AudienceResolution {
  readonly recipients: readonly ResolvedRecipient[];
  readonly optedOut: readonly ExcludedRecipient[];
  readonly outOfScope: readonly ExcludedRecipient[];
  readonly withdrawn: readonly ExcludedRecipient[];
  readonly duplicatesRemoved: readonly PersonId[];
  readonly warnings: readonly string[];
  /** Vrai si l'audience interdit toute approbation de campagne. */
  readonly blocking: boolean;
  readonly recipientCount: number;
}

function isCohortAllowed(scope: ActorScope, cohortId: CohortId): boolean {
  if (scope.cohortIds === undefined) return true;
  return scope.cohortIds.includes(cohortId);
}

function toRecipient(row: DirectoryRow): ResolvedRecipient {
  return {
    personId: row.person.id,
    fullName: row.fullName,
    email: row.email,
    cohortId: row.enrollment.cohortId,
    cohortLabel: row.cohortLabel,
  };
}

/** Sélection brute (avant périmètre / retraits / préférences). */
function selectRows(
  definition: AudienceDefinition,
  snapshot: CommunicationSnapshot,
): { readonly rows: readonly DirectoryRow[]; readonly unknownIds: readonly PersonId[] } {
  const rows = snapshot.rows;
  switch (definition.kind) {
    case "program_all":
      return { rows, unknownIds: [] };
    case "cohort":
      return { rows: rows.filter((r) => r.enrollment.cohortId === definition.cohortId), unknownIds: [] };
    case "group": {
      const group = snapshot.groups.find((g) => g.groupId === definition.groupId);
      if (!group) return { rows: [], unknownIds: [] };
      const set = new Set<string>(group.personIds);
      const unknown = group.personIds.filter((id) => !rows.some((r) => r.person.id === id));
      return { rows: rows.filter((r) => set.has(r.person.id)), unknownIds: unknown };
    }
    case "persons": {
      const set = new Set<string>(definition.personIds);
      const unknown = definition.personIds.filter((id) => !rows.some((r) => r.person.id === id));
      return { rows: rows.filter((r) => set.has(r.person.id)), unknownIds: unknown };
    }
    case "contextual_role": {
      const matching = rows.filter((r) => r.roles.includes(definition.role));
      return {
        rows:
          definition.cohortId === undefined
            ? matching
            : matching.filter((r) => r.enrollment.cohortId === definition.cohortId),
        unknownIds: [],
      };
    }
    case "dynamic_filter":
      return { rows: filterDirectoryRows(rows, definition.filter), unknownIds: [] };
    case "milestone_incomplete": {
      const milestone = snapshot.milestones.find((m) => m.milestoneId === definition.milestoneId);
      if (!milestone) return { rows: [], unknownIds: [] };
      const done = new Set<string>(milestone.completedPersonIds);
      return { rows: rows.filter((r) => !done.has(r.person.id)), unknownIds: [] };
    }
    case "overdue": {
      const asOf = Date.parse(definition.asOf);
      const milestones =
        definition.milestoneId === undefined
          ? snapshot.milestones
          : snapshot.milestones.filter((m) => m.milestoneId === definition.milestoneId);
      const late = new Set<string>();
      for (const milestone of milestones) {
        if (!milestone.dueAt) continue;
        if (Number.isNaN(asOf) || Date.parse(milestone.dueAt) >= asOf) continue;
        const done = new Set<string>(milestone.completedPersonIds);
        for (const row of rows) if (!done.has(row.person.id)) late.add(row.person.id);
      }
      return { rows: rows.filter((r) => late.has(r.person.id)), unknownIds: [] };
    }
  }
}

/**
 * Résolution PURE d'une audience. Ne lit aucune horloge, aucun stockage.
 * Rappel : ce filtrage client ne vaut pas contrôle d'accès (RLS côté serveur).
 */
export function resolveAudience(
  definition: AudienceDefinition,
  snapshot: CommunicationSnapshot,
  actorScope: ActorScope,
  preferences: readonly CommunicationPreference[],
  options: { readonly channel?: MessageChannel } = {},
): AudienceResolution {
  const channel: MessageChannel = options.channel ?? "email";
  const warnings: string[] = [];
  const outOfScope: ExcludedRecipient[] = [];
  const withdrawn: ExcludedRecipient[] = [];
  const optedOut: ExcludedRecipient[] = [];
  const duplicatesRemoved: PersonId[] = [];
  const recipients: ResolvedRecipient[] = [];
  const seen = new Set<string>();

  const programAllowed = actorScope.programIds.includes(snapshot.programId);
  const { rows, unknownIds } = selectRows(definition, snapshot);

  if (!programAllowed) {
    for (const row of rows) outOfScope.push({ personId: row.person.id, reason: "out_of_scope" });
    return {
      recipients: [],
      optedOut: [],
      outOfScope,
      withdrawn: [],
      duplicatesRemoved: [],
      warnings: ["Programme hors du périmètre de l'émetteur : campagne bloquée."],
      blocking: true,
      recipientCount: 0,
    };
  }

  if (definition.kind === "cohort" && !isCohortAllowed(actorScope, definition.cohortId)) {
    warnings.push("Cohorte hors du périmètre de l'émetteur : campagne bloquée.");
  }

  for (const id of unknownIds) {
    outOfScope.push({ personId: id, reason: "unknown_person" });
  }
  if (unknownIds.length > 0) {
    warnings.push(
      `${unknownIds.length} personne(s) demandée(s) hors du périmètre du programme : retirée(s).`,
    );
  }

  const optOutIndex = new Set(
    preferences.filter((p) => p.optedOut && p.channel === channel).map((p) => `${p.personId}`),
  );

  for (const row of rows) {
    const personId = row.person.id;
    if (!isCohortAllowed(actorScope, row.enrollment.cohortId)) {
      outOfScope.push({ personId, reason: "out_of_scope" });
      continue;
    }
    if (!DEFAULT_ELIGIBLE_STATUSES.includes(row.enrollment.status)) {
      withdrawn.push({ personId, reason: "withdrawn" });
      continue;
    }
    if (seen.has(personId)) {
      duplicatesRemoved.push(personId);
      continue;
    }
    seen.add(personId);
    if (optOutIndex.has(personId)) {
      optedOut.push({ personId, reason: "opted_out" });
      continue;
    }
    recipients.push(toRecipient(row));
  }

  if (outOfScope.some((e) => e.reason === "out_of_scope")) {
    warnings.push("Des personnes hors périmètre ont été demandées : campagne bloquée.");
  }
  if (withdrawn.length > 0) {
    warnings.push(`${withdrawn.length} inscription(s) retirée(s) exclue(s) par défaut.`);
  }
  if (duplicatesRemoved.length > 0) {
    warnings.push(`${duplicatesRemoved.length} doublon(s) éliminé(s) par personne.`);
  }
  if (optedOut.length > 0) {
    warnings.push(`${optedOut.length} personne(s) désinscrite(s) de ce canal : retirée(s).`);
  }
  if (recipients.length === 0) {
    warnings.push("Audience vide : aucun destinataire résolu.");
  }

  const blocking =
    recipients.length === 0 ||
    outOfScope.some((e) => e.reason === "out_of_scope") ||
    (definition.kind === "cohort" && !isCohortAllowed(actorScope, definition.cohortId));

  return {
    recipients,
    optedOut,
    outOfScope,
    withdrawn,
    duplicatesRemoved,
    warnings,
    blocking,
    recipientCount: recipients.length,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Variables autorisées                                             */
/* ------------------------------------------------------------------ */

export const ALLOWED_VARIABLES = [
  "firstName",
  "lastName",
  "programTitle",
  "cohortTitle",
  "nextDeadline",
  "milestoneTitle",
  "accessLink",
  "coordinatorName",
] as const;

export type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Variables citées dans un texte (déterministe, ordre d'apparition). */
export function extractVariables(text: string): readonly string[] {
  const found: string[] = [];
  for (const match of text.matchAll(VARIABLE_RE)) {
    const name = match[1] ?? "";
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

export function isAllowedVariable(name: string): name is AllowedVariable {
  return (ALLOWED_VARIABLES as readonly string[]).includes(name);
}

/** Refus des injections : aucune balise, aucune entité, aucun schéma exécutable. */
const UNSAFE_RE = /<[^>]*>|<\/|&#|javascript:|data:text\/html|on[a-z]+\s*=/i;

export function containsUnsafeMarkup(value: string): boolean {
  return UNSAFE_RE.test(value);
}

export interface VariableContext {
  readonly recipient: ResolvedRecipient;
  readonly snapshot: CommunicationSnapshot;
  readonly milestoneTitle?: string | undefined;
}

export type VariableIssueKind =
  | "unknown_variable"
  | "unresolved_variable"
  | "unsafe_value"
  | "patient_variable";

export interface VariableIssue {
  readonly kind: VariableIssueKind;
  readonly variable: string;
  readonly message: string;
}

export interface RenderedPreview {
  readonly personId: PersonId;
  readonly subject: string;
  readonly body: string;
  readonly issues: readonly VariableIssue[];
  readonly valid: boolean;
}

/** Toute variable évoquant un patient est refusée, même « autorisée » ailleurs. */
const PATIENT_VARIABLE_RE = /patient|nir|ipp|birth|naissance|diagnos/i;

function variableValue(name: AllowedVariable, ctx: VariableContext): string | undefined {
  const parts = ctx.recipient.fullName.split(" ");
  switch (name) {
    case "firstName":
      return parts[0];
    case "lastName":
      return parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    case "programTitle":
      return ctx.snapshot.programTitle || undefined;
    case "cohortTitle":
      return ctx.recipient.cohortLabel || undefined;
    case "nextDeadline":
      return ctx.snapshot.nextDeadlineByPerson?.[ctx.recipient.personId];
    case "milestoneTitle":
      return ctx.milestoneTitle;
    case "accessLink":
      return ctx.snapshot.accessLink;
    case "coordinatorName":
      return ctx.snapshot.coordinatorName || undefined;
  }
}

/** Rendu d'un aperçu PAR DESTINATAIRE (aucun envoi, aucun effet de bord). */
export function renderForRecipient(
  subject: string,
  body: string,
  ctx: VariableContext,
): RenderedPreview {
  const issues: VariableIssue[] = [];

  const render = (text: string): string =>
    text.replace(VARIABLE_RE, (_full, rawName: string) => {
      const name = rawName.trim();
      if (PATIENT_VARIABLE_RE.test(name)) {
        issues.push({
          kind: "patient_variable",
          variable: name,
          message: `Variable liée à un patient interdite : ${name}.`,
        });
        return `{{${name}}}`;
      }
      if (!isAllowedVariable(name)) {
        issues.push({
          kind: "unknown_variable",
          variable: name,
          message: `Variable inconnue : ${name}.`,
        });
        return `{{${name}}}`;
      }
      const value = variableValue(name, ctx);
      if (value === undefined || value.trim() === "") {
        issues.push({
          kind: "unresolved_variable",
          variable: name,
          message: `Variable non résolue pour ce destinataire : ${name}.`,
        });
        return `{{${name}}}`;
      }
      if (containsUnsafeMarkup(value)) {
        issues.push({
          kind: "unsafe_value",
          variable: name,
          message: `Contenu HTML ou script refusé dans la variable ${name}.`,
        });
        return `{{${name}}}`;
      }
      return value;
    });

  const renderedSubject = render(subject);
  const renderedBody = render(body);

  return {
    personId: ctx.recipient.personId,
    subject: renderedSubject,
    body: renderedBody,
    issues,
    valid: issues.length === 0,
  };
}

/** Aperçus de toute l'audience résolue (préparation seule). */
export function previewCampaign(
  campaign: Pick<CommunicationCampaign, "subject" | "body">,
  resolution: AudienceResolution,
  snapshot: CommunicationSnapshot,
  options: { readonly milestoneTitle?: string } = {},
): readonly RenderedPreview[] {
  return resolution.recipients.map((recipient) =>
    renderForRecipient(campaign.subject, campaign.body, {
      recipient,
      snapshot,
      milestoneTitle: options.milestoneTitle,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* 7. Détection de données patients                                    */
/* ------------------------------------------------------------------ */

export type PatientDataVerdict = "none" | "warning" | "blocking";

export interface PatientDataScan {
  readonly verdict: PatientDataVerdict;
  readonly markers: readonly string[];
  /** Avertissement obligatoire : une détection automatique ne garantit rien. */
  readonly disclaimerFr: string;
}

/** Marqueurs strictement identifiants : blocage immédiat. */
const BLOCKING_MARKERS: readonly string[] = [
  "numéro de sécurité sociale",
  "nir",
  "ipp",
  "nom du patient",
  "adresse du patient",
  "téléphone du patient",
];

export const PATIENT_SCAN_DISCLAIMER_FR =
  "La détection automatique de marqueurs ne garantit à elle seule aucune absence de données sensibles : une relecture humaine reste obligatoire.";

/** Contrôle du SUJET et du CORPS d'une campagne (réutilise le garde-fou DPC). */
export function scanPatientData(subject: string, body: string): PatientDataScan {
  const markers = detectPatientDataMarkers([subject, body]);
  const blocking = markers.some((m) => BLOCKING_MARKERS.includes(m));
  return {
    verdict: markers.length === 0 ? "none" : blocking ? "blocking" : "warning",
    markers,
    disclaimerFr: PATIENT_SCAN_DISCLAIMER_FR,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Validation / approbation d'une campagne                          */
/* ------------------------------------------------------------------ */

export type CampaignCheckId =
  | "actor_in_scope"
  | "audience_resolved"
  | "content_valid"
  | "no_patient_marker"
  | "recipient_cap"
  | "collective_confirmation"
  | "template_validated"
  | "trigger_time_zone"
  | "future_schedule"
  | "no_opted_out_recipient";

export interface CampaignCheck {
  readonly id: CampaignCheckId;
  readonly label: string;
  readonly satisfied: boolean;
  readonly detail: string;
}

export interface CampaignApproval {
  readonly canApprove: boolean;
  readonly checks: readonly CampaignCheck[];
  readonly blockingReasons: readonly string[];
}

export interface ApprovalInput {
  readonly campaign: CommunicationCampaign;
  readonly resolution: AudienceResolution;
  readonly previews: readonly RenderedPreview[];
  readonly patientScan: PatientDataScan;
  readonly actorScope: ActorScope;
  readonly template?: CommMessageTemplate | undefined;
  readonly trigger: ScheduleTrigger;
  /** Horloge fournie explicitement (aucune lecture implicite du temps). */
  readonly now: IsoDateTime;
}

const TIMED_TRIGGERS: readonly ScheduleTrigger["kind"][] = [
  "at",
  "recurring",
  "before_due",
  "after_overdue",
];

function triggerTimeZone(trigger: ScheduleTrigger): string | undefined {
  return "timeZone" in trigger ? trigger.timeZone : undefined;
}

/** Fonction PURE : décide si une campagne peut être approuvée. */
export function canApproveCampaign(input: ApprovalInput): CampaignApproval {
  const { campaign, resolution, previews, patientScan, actorScope, template, trigger, now } = input;

  const actorInScope =
    actorScope.programIds.includes(campaign.programId) &&
    (actorScope.role === "administrator" ||
      actorScope.role === "teacher" ||
      actorScope.role === "placement_supervisor");

  const contentValid =
    campaign.subject.trim() !== "" &&
    campaign.body.trim() !== "" &&
    !containsUnsafeMarkup(campaign.subject) &&
    !containsUnsafeMarkup(campaign.body) &&
    previews.every((p) => p.valid) &&
    extractVariables(`${campaign.subject} ${campaign.body}`).every(isAllowedVariable);

  const timedTrigger = TIMED_TRIGGERS.includes(trigger.kind);
  const zone = triggerTimeZone(trigger);
  const timeZoneOk = !timedTrigger || (zone !== undefined && zone.trim() !== "");

  let futureOk = true;
  if (trigger.kind === "at" || trigger.kind === "recurring") {
    const target = Date.parse(trigger.kind === "at" ? trigger.at : trigger.startAt);
    const reference = Date.parse(now);
    futureOk = !Number.isNaN(target) && !Number.isNaN(reference) && target > reference;
  }

  const optedOutIds = new Set(resolution.optedOut.map((p) => `${p.personId}`));
  const noOptedOutKept = !resolution.recipients.some((r) => optedOutIds.has(`${r.personId}`));

  const checks: readonly CampaignCheck[] = [
    {
      id: "actor_in_scope",
      label: "Auteur autorisé dans le périmètre",
      satisfied: actorInScope,
      detail: actorInScope
        ? "Périmètre de l'émetteur cohérent avec le programme."
        : "Émetteur hors périmètre ou rôle non habilité.",
    },
    {
      id: "audience_resolved",
      label: "Audience résolue et non bloquée",
      satisfied: !resolution.blocking && resolution.recipientCount > 0,
      detail: resolution.blocking
        ? resolution.warnings.join(" ")
        : `${resolution.recipientCount} destinataire(s) résolu(s).`,
    },
    {
      id: "content_valid",
      label: "Sujet et corps valides",
      satisfied: contentValid,
      detail: contentValid
        ? "Contenu non vide, sans balise, variables autorisées et résolues."
        : "Contenu vide, balisé, ou variables inconnues / non résolues.",
    },
    {
      id: "no_patient_marker",
      label: "Absence de marqueur patient bloquant",
      satisfied: patientScan.verdict !== "blocking",
      detail:
        patientScan.verdict === "none"
          ? PATIENT_SCAN_DISCLAIMER_FR
          : `Marqueurs détectés : ${patientScan.markers.join(", ")}. ${PATIENT_SCAN_DISCLAIMER_FR}`,
    },
    {
      id: "recipient_cap",
      label: "Plafond de destinataires respecté",
      satisfied: resolution.recipientCount <= campaign.maxRecipients,
      detail: `${resolution.recipientCount} / ${campaign.maxRecipients}.`,
    },
    {
      id: "collective_confirmation",
      label: "Confirmation collective",
      satisfied:
        !campaign.requiresCollectiveConfirmation ||
        (campaign.collectiveConfirmationAt ?? "").trim() !== "",
      detail: campaign.requiresCollectiveConfirmation
        ? "Confirmation explicite requise avant tout envoi collectif."
        : "Non requise pour cette campagne.",
    },
    {
      id: "template_validated",
      label: "Modèle validé",
      satisfied:
        campaign.templateId === undefined ||
        (template !== undefined &&
          template.id === campaign.templateId &&
          template.status === "validated"),
      detail:
        campaign.templateId === undefined
          ? "Aucun modèle utilisé."
          : "Le modèle doit être au statut « validated ».",
    },
    {
      id: "trigger_time_zone",
      label: "Fuseau horaire du déclenchement",
      satisfied: timeZoneOk,
      detail: timedTrigger
        ? "Tout déclenchement temporel exige un fuseau explicite."
        : "Déclenchement non temporel.",
    },
    {
      id: "future_schedule",
      label: "Date d'envoi future",
      satisfied: futureOk,
      detail: futureOk ? "Date postérieure à la référence." : "Date programmée déjà passée.",
    },
    {
      id: "no_opted_out_recipient",
      label: "Aucun opt-out conservé",
      satisfied: noOptedOutKept,
      detail: noOptedOutKept
        ? "Préférences appliquées."
        : "Une personne désinscrite figure encore dans la liste finale.",
    },
  ];

  const blockingReasons = checks.filter((c) => !c.satisfied).map((c) => `${c.label} : ${c.detail}`);
  return { canApprove: blockingReasons.length === 0, checks, blockingReasons };
}

/** Transition de statut : `scheduled` exige une campagne APPROUVÉE. */
export function canSchedule(campaign: CommunicationCampaign): boolean {
  return campaign.status === "approved" && (campaign.approvedBy ?? "") !== "";
}

/** Applique la transition ; renvoie la campagne inchangée si elle est interdite. */
export function scheduleCampaign(
  campaign: CommunicationCampaign,
): { readonly campaign: CommunicationCampaign; readonly rejected: boolean } {
  if (!canSchedule(campaign)) return { campaign, rejected: true };
  return { campaign: { ...campaign, status: "scheduled" }, rejected: false };
}

/* ------------------------------------------------------------------ */
/* 9. Journal (types uniquement, aucun stockage)                       */
/* ------------------------------------------------------------------ */

export type CommunicationEventType =
  | "campaign_created"
  | "campaign_approved"
  | "campaign_scheduled"
  | "campaign_cancelled"
  | "campaign_dispatched";

export interface CommunicationEvent {
  readonly type: CommunicationEventType;
  readonly campaignId: CommCampaignId;
  readonly programId: ProgramId;
  readonly actorPersonId: PersonId;
  readonly at: IsoDateTime;
  readonly recipientCount?: number | undefined;
  readonly note?: string | undefined;
}
