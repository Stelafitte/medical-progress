/**
 * Gouvernance PLATEFORME (maquette déterministe).
 *
 * Complète `platformSettings.ts` avec le paramétrage attendu d'une direction de
 * plateforme : sécurité et authentification, conservation des données,
 * délégations de rôles contextualisés, drapeaux de fonctionnalités par
 * programme, maintenance et exports d'audit.
 *
 * Aucune de ces valeurs n'est appliquée par un serveur dans cette itération :
 * toutes les fonctions sont pures et testées, et l'interface étiquette la
 * simulation.
 */
import { containsUnsafeMarkup, scanPatientData } from "./communication";
import type { ProgramId, Role } from "./types";

export const PLATFORM_GOVERNANCE_MOCK_FR =
  "Gouvernance simulée : ces règles décrivent le cadre cible et ne pilotent encore aucun service.";

/* ------------------------------------------------------------------ */
/* Sécurité et authentification                                        */
/* ------------------------------------------------------------------ */

export interface PlatformSecurityPolicy {
  /** Double facteur imposé aux rôles d'administration. */
  readonly mfaRequiredForAdmins: boolean;
  /** Expiration d'une session inactive, en minutes. */
  readonly sessionTimeoutMinutes: number;
  readonly passwordMinLength: number;
  /** Domaines de courriel autorisés à créer un compte (vide = aucun filtre). */
  readonly allowedEmailDomains: readonly string[];
  /** Journalisation de chaque accès à une fiche personne. */
  readonly logPersonFileAccess: boolean;
}

export function validateSecurityPolicy(policy: PlatformSecurityPolicy): readonly string[] {
  const errors: string[] = [];
  if (!policy.mfaRequiredForAdmins)
    errors.push(
      "Le double facteur reste obligatoire pour les rôles d'administration : il protège les fiches et le paramétrage.",
    );
  if (!Number.isFinite(policy.sessionTimeoutMinutes) || policy.sessionTimeoutMinutes < 5)
    errors.push("L'expiration de session doit être d'au moins 5 minutes.");
  if (policy.sessionTimeoutMinutes > 480)
    errors.push("L'expiration de session ne peut pas dépasser 8 heures.");
  if (!Number.isFinite(policy.passwordMinLength) || policy.passwordMinLength < 12)
    errors.push("La longueur minimale de mot de passe est de 12 caractères.");
  if (!policy.logPersonFileAccess)
    errors.push("La journalisation des accès aux fiches ne peut pas être désactivée.");
  for (const domain of policy.allowedEmailDomains) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim()))
      errors.push(`Domaine invalide : « ${domain} ».`);
  }
  return errors;
}

/** Vrai si une adresse est acceptée par la liste de domaines (vide = tout). */
export function isEmailDomainAllowed(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const at = email.trim().toLowerCase().split("@")[1];
  if (!at) return false;
  return domains.some((d) => d.trim().toLowerCase() === at);
}

/* ------------------------------------------------------------------ */
/* Conservation des données                                            */
/* ------------------------------------------------------------------ */

export interface DataRetentionPolicy {
  /** Preuves pédagogiques et validations, en mois. */
  readonly evidenceMonths: number;
  /** Journal d'audit, en mois. */
  readonly auditMonths: number;
  /** Médias déposés (supports, photos de carnet), en mois. */
  readonly mediaMonths: number;
  /** Purge automatique après export d'archive. */
  readonly purgeAfterExport: boolean;
  readonly dpoEmail: string;
}

export function validateRetentionPolicy(policy: DataRetentionPolicy): readonly string[] {
  const errors: string[] = [];
  if (!Number.isFinite(policy.evidenceMonths) || policy.evidenceMonths < 12)
    errors.push("Les preuves doivent être conservées au moins 12 mois.");
  if (!Number.isFinite(policy.auditMonths) || policy.auditMonths < 36)
    errors.push("Le journal d'audit doit être conservé au moins 36 mois.");
  if (!Number.isFinite(policy.mediaMonths) || policy.mediaMonths < 1)
    errors.push("La conservation des médias doit être d'au moins 1 mois.");
  if (policy.auditMonths < policy.evidenceMonths)
    errors.push("Le journal d'audit ne peut pas être purgé avant les preuves qu'il trace.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(policy.dpoEmail.trim()))
    errors.push("L'adresse du délégué à la protection des données n'est pas valide.");
  return errors;
}

/* ------------------------------------------------------------------ */
/* Délégations de rôles contextualisés                                 */
/* ------------------------------------------------------------------ */

export interface RoleDelegationDraft {
  readonly personId: string;
  readonly role: Role;
  /** Portée : un programme, ou la plateforme entière. */
  readonly scope: "platform" | "program";
  readonly programId?: ProgramId;
  readonly reason: string;
  /** Fin de délégation au format ISO (obligatoire, jamais illimitée). */
  readonly expiresOn: string;
}

export function validateRoleDelegation(
  draft: RoleDelegationDraft,
  today: string,
): readonly string[] {
  const errors: string[] = [];
  if (!draft.personId) errors.push("Sélectionnez la personne concernée.");
  if (draft.scope === "program" && !draft.programId)
    errors.push("Une délégation de portée programme exige un programme.");
  if (draft.scope === "platform" && draft.role !== "administrator")
    errors.push("Seul un rôle d'administrateur peut avoir une portée plateforme.");
  if (draft.reason.trim().length < 10)
    errors.push("Un motif explicite de 10 caractères minimum est obligatoire.");
  if (!draft.expiresOn) errors.push("Une date de fin de délégation est obligatoire.");
  else if (draft.expiresOn <= today)
    errors.push("La fin de délégation doit être postérieure à aujourd'hui.");
  return errors;
}

/** Trace lisible d'une délégation, pour le journal d'audit. */
export function roleDelegationAuditLabel(draft: RoleDelegationDraft): string {
  const scope = draft.scope === "platform" ? "plateforme" : `programme ${draft.programId}`;
  return `Délégation ${draft.role} (${scope}) jusqu'au ${draft.expiresOn} — motif : ${draft.reason.trim()}`;
}

/* ------------------------------------------------------------------ */
/* Drapeaux de fonctionnalités par programme                           */
/* ------------------------------------------------------------------ */

export type FeatureFlagKey =
  | "ai_tutor"
  | "narrated_resources"
  | "stage_logbook"
  | "ecos_simulation"
  | "self_declaration"
  | "certificates";

export const FEATURE_FLAG_LABELS_FR: Record<FeatureFlagKey, string> = {
  ai_tutor: "Tuteur IA sur les supports",
  narrated_resources: "Supports sonorisés",
  stage_logbook: "Carnet de stage",
  ecos_simulation: "Simulation ECOS",
  self_declaration: "Auto-déclaration d'acquis",
  certificates: "Attestations et certificats",
};

export const FEATURE_FLAG_ORDER: readonly FeatureFlagKey[] = [
  "ai_tutor",
  "narrated_resources",
  "stage_logbook",
  "ecos_simulation",
  "self_declaration",
  "certificates",
];

export type FeatureFlags = Readonly<Record<FeatureFlagKey, boolean>>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  ai_tutor: false,
  narrated_resources: true,
  stage_logbook: true,
  ecos_simulation: false,
  self_declaration: true,
  certificates: true,
};

/**
 * Cohérence des drapeaux : l'IA locale reste impossible si l'exploitation IA
 * est coupée au niveau plateforme, et une auto-déclaration seule ne peut pas
 * exister sans validation tierce (carnet de stage).
 */
export function validateFeatureFlags(
  flags: FeatureFlags,
  context: { readonly aiEnabledPlatformWide: boolean },
): readonly string[] {
  const errors: string[] = [];
  if (flags.ai_tutor && !context.aiEnabledPlatformWide)
    errors.push("Le tuteur IA exige l'activation de l'IA dans le cadre général.");
  if (flags.ecos_simulation && !context.aiEnabledPlatformWide)
    errors.push("La simulation ECOS repose sur l'IA : activez-la d'abord dans le cadre général.");
  if (flags.self_declaration && !flags.stage_logbook)
    errors.push(
      "L'auto-déclaration ne peut pas être ouverte sans carnet de stage : une compétence réelle exige une validation tierce.",
    );
  return errors;
}

/* ------------------------------------------------------------------ */
/* Maintenance et bandeau d'information                                */
/* ------------------------------------------------------------------ */

export interface MaintenanceSettings {
  /** Plateforme en lecture seule : aucune preuve ni validation ne peut être créée. */
  readonly readOnlyMode: boolean;
  readonly bannerMessage: string;
  /** Fenêtre planifiée, format libre court (ex. « 12/09 22h–23h »). */
  readonly windowLabel: string;
}

export function validateMaintenance(settings: MaintenanceSettings): readonly string[] {
  const errors: string[] = [];
  const message = settings.bannerMessage.trim();
  if (settings.readOnlyMode && message.length < 10)
    errors.push("Le mode lecture seule exige un message d'information d'au moins 10 caractères.");
  if (containsUnsafeMarkup(settings.bannerMessage))
    errors.push("Le message comporte du balisage exécutable : il est refusé.");
  if (scanPatientData(settings.bannerMessage).verdict !== "none")
    errors.push("Le bandeau ne doit contenir aucune donnée patient.");
  if (message.length > 240) errors.push("Le message doit rester sous 240 caractères.");
  return errors;
}

/* ------------------------------------------------------------------ */
/* Exports d'audit                                                     */
/* ------------------------------------------------------------------ */

export type AuditExportScope = "platform" | "program" | "person";

export const AUDIT_EXPORT_SCOPE_LABELS_FR: Record<AuditExportScope, string> = {
  platform: "Toute la plateforme",
  program: "Un programme",
  person: "Une personne",
};

export interface AuditExportDraft {
  readonly scope: AuditExportScope;
  readonly programId?: ProgramId;
  readonly personId?: string;
  readonly fromDate: string;
  readonly toDate: string;
  /** Inclure les identités nominatives (motif alors renforcé). */
  readonly includeIdentities: boolean;
  readonly reason: string;
}

export function validateAuditExport(draft: AuditExportDraft): readonly string[] {
  const errors: string[] = [];
  if (!draft.fromDate || !draft.toDate) errors.push("Renseignez la période d'export.");
  else if (draft.fromDate > draft.toDate)
    errors.push("La date de début doit précéder la date de fin.");
  if (draft.scope === "program" && !draft.programId) errors.push("Choisissez le programme visé.");
  if (draft.scope === "person" && !draft.personId) errors.push("Choisissez la personne visée.");
  if (draft.reason.trim().length < 10) errors.push("Un motif de 10 caractères minimum est requis.");
  if (draft.includeIdentities && draft.reason.trim().length < 30)
    errors.push(
      "Un export nominatif exige un motif détaillé de 30 caractères minimum (finalité et destinataire).",
    );
  if (draft.scope === "person" && !draft.includeIdentities)
    errors.push("Un export ciblant une personne est nécessairement nominatif.");
  return errors;
}

/** Trace lisible d'un export d'audit demandé. */
export function auditExportLabel(draft: AuditExportDraft): string {
  const target =
    draft.scope === "program"
      ? `programme ${draft.programId}`
      : draft.scope === "person"
        ? `personne ${draft.personId}`
        : "plateforme";
  return `Export audit ${target} du ${draft.fromDate} au ${draft.toDate}${
    draft.includeIdentities ? " (nominatif)" : " (anonymisé)"
  }`;
}

/* ------------------------------------------------------------------ */
/* Intégrations externes (catalogue, aucun secret ici)                 */
/* ------------------------------------------------------------------ */

export type IntegrationStatus = "planned" | "simulated" | "disabled";

export const INTEGRATION_STATUS_LABELS_FR: Record<IntegrationStatus, string> = {
  planned: "Prévu",
  simulated: "Simulé",
  disabled: "Désactivé",
};

export interface IntegrationEntry {
  readonly key: string;
  readonly label: string;
  readonly purpose: string;
  readonly status: IntegrationStatus;
}

/**
 * Catalogue d'intégrations. Aucune clé n'est stockée côté interface : les
 * secrets resteront côté serveur lorsque la plateforme sera branchée.
 */
export const INTEGRATION_CATALOG: readonly IntegrationEntry[] = [
  {
    key: "smtp",
    label: "Passerelle courriel",
    purpose: "Envoi des convocations, rappels et courriels aux intervenants.",
    status: "planned",
  },
  {
    key: "sms",
    label: "Passerelle SMS",
    purpose: "Convocations urgentes aux séances de simulation.",
    status: "planned",
  },
  {
    key: "ai_gateway",
    label: "Passerelle IA propriétaire",
    purpose: "Tuteur, ECOS et génération de supports, avec quotas et comptabilité.",
    status: "disabled",
  },
  {
    key: "sso",
    label: "Authentification universitaire",
    purpose: "Fédération d'identité des facultés partenaires.",
    status: "planned",
  },
  {
    key: "storage",
    label: "Stockage privé des médias",
    purpose: "Dépôt des supports et des photos de carnet, buckets privés.",
    status: "simulated",
  },
];
