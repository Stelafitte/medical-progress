/**
 * Paramétrage PLATEFORME (maquette).
 *
 * Toutes les valeurs ci-dessous décrivent un cadre : aucune n'est appliquée
 * par un serveur dans cette itération. Les validations sont pures et testées.
 */
import { containsUnsafeMarkup, scanPatientData } from "./communication";
import type { ProgramId } from "./types";

export const PLATFORM_SETTINGS_MOCK_FR =
  "Paramétrage simulé : les valeurs sont conservées le temps de la session et ne pilotent aucun service réel.";

/* ------------------------------------------------------------------ */
/* Cadre général                                                       */
/* ------------------------------------------------------------------ */

export interface PlatformGeneralSettings {
  readonly platformName: string;
  readonly supportEmail: string;
  /** Conservation des traces et des preuves, en mois. */
  readonly retentionMonths: number;
  /** Publication d'un programme conditionnée à une validation humaine. */
  readonly requireHumanValidation: boolean;
  /** Exploitation IA globalement autorisée (jamais d'appel réel ici). */
  readonly aiEnabled: boolean;
  readonly storageQuotaGb: number;
}

export function validateGeneralSettings(input: PlatformGeneralSettings): readonly string[] {
  const errors: string[] = [];
  if (input.platformName.trim().length < 3) errors.push("Le nom de la plateforme est requis.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.supportEmail.trim()))
    errors.push("L'adresse de support n'est pas valide.");
  if (!Number.isFinite(input.retentionMonths) || input.retentionMonths < 1)
    errors.push("La durée de conservation doit être d'au moins 1 mois.");
  if (!Number.isFinite(input.storageQuotaGb) || input.storageQuotaGb < 1)
    errors.push("Le quota de stockage doit être d'au moins 1 Go.");
  if (!input.requireHumanValidation)
    errors.push(
      "La validation humaine avant publication ne peut pas être désactivée : elle protège la conformité pédagogique.",
    );
  return errors;
}

/* ------------------------------------------------------------------ */
/* Cadre par programme                                                 */
/* ------------------------------------------------------------------ */

export interface ProgramPlatformSettings {
  readonly programId: ProgramId;
  readonly learnerCap: number;
  readonly aiCreditQuota: number;
  readonly storageQuotaGb: number;
  readonly placementsEnabled: boolean;
  readonly notificationsEnabled: boolean;
}

export function validateProgramSettings(input: ProgramPlatformSettings): readonly string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.learnerCap) || input.learnerCap < 1)
    errors.push("Le plafond d'apprenants doit être d'au moins 1.");
  if (!Number.isFinite(input.aiCreditQuota) || input.aiCreditQuota < 0)
    errors.push("Le quota de crédits IA ne peut pas être négatif.");
  if (!Number.isFinite(input.storageQuotaGb) || input.storageQuotaGb < 1)
    errors.push("Le quota de stockage du programme doit être d'au moins 1 Go.");
  return errors;
}

/* ------------------------------------------------------------------ */
/* Notifications et sollicitations                                     */
/* ------------------------------------------------------------------ */

export type NotificationChannel = "email" | "in_app" | "sms";

export const NOTIFICATION_CHANNEL_LABELS_FR: Record<NotificationChannel, string> = {
  email: "Courriel",
  in_app: "Notification dans l'application",
  sms: "SMS",
};

export type NotificationCadence = "immediate" | "daily" | "weekly" | "disabled";

export const NOTIFICATION_CADENCE_LABELS_FR: Record<NotificationCadence, string> = {
  immediate: "immédiate",
  daily: "récapitulatif quotidien",
  weekly: "récapitulatif hebdomadaire",
  disabled: "désactivée",
};

export type SolicitationKind =
  | "placement_reminder"
  | "logbook_validation"
  | "document_missing"
  | "session_convocation"
  | "ai_quota_alert";

export const SOLICITATION_LABELS_FR: Record<SolicitationKind, string> = {
  placement_reminder: "Rappel de stage à venir",
  logbook_validation: "Carnet en attente de validation",
  document_missing: "Pièce administrative manquante",
  session_convocation: "Convocation à une séance",
  ai_quota_alert: "Alerte de quota IA",
};

export interface NotificationRule {
  readonly kind: SolicitationKind;
  readonly channel: NotificationChannel;
  readonly cadence: NotificationCadence;
  /** Destinataires visés, en clair, pour éviter toute ambiguïté de périmètre. */
  readonly audienceLabel: string;
}

/** Une alerte de quota IA ne peut pas viser les apprenants. */
export function validateNotificationRule(rule: NotificationRule): readonly string[] {
  const errors: string[] = [];
  if (rule.kind === "ai_quota_alert" && /apprenant/i.test(rule.audienceLabel))
    errors.push("Une alerte de quota IA ne s'adresse jamais aux apprenants.");
  if (rule.channel === "sms" && rule.cadence === "immediate" && rule.kind !== "session_convocation")
    errors.push("Le SMS immédiat est réservé aux convocations.");
  return errors;
}

/* ------------------------------------------------------------------ */
/* Courriel aux non-apprenants                                         */
/* ------------------------------------------------------------------ */

export interface NonLearnerMailingDraft {
  readonly subject: string;
  readonly body: string;
  /** Groupes destinataires, hors apprenants. */
  readonly groupKeys: readonly string[];
}

export interface NonLearnerMailingCheck {
  readonly errors: readonly string[];
  readonly patientVerdict: "none" | "warning" | "blocking";
  readonly markers: readonly string[];
  readonly canPrepare: boolean;
}

/**
 * Contrôle d'un courriel destiné aux intervenants.
 * Aucun envoi réel : la préparation est bloquée si un marqueur patient est
 * détecté ou si le contenu comporte du balisage exécutable.
 */
export function checkNonLearnerMailing(
  draft: NonLearnerMailingDraft,
  recipientCount: number,
): NonLearnerMailingCheck {
  const errors: string[] = [];
  if (draft.subject.trim().length < 3) errors.push("L'objet est requis (3 caractères minimum).");
  if (draft.body.trim().length < 10) errors.push("Le corps du message est trop court.");
  if (draft.groupKeys.length === 0) errors.push("Sélectionnez au moins un groupe destinataire.");
  if (draft.groupKeys.includes("learner"))
    errors.push("Cet outil exclut les apprenants : utilisez les communications du programme.");
  if (recipientCount === 0) errors.push("Aucun destinataire ne correspond aux groupes choisis.");
  if (containsUnsafeMarkup(draft.subject) || containsUnsafeMarkup(draft.body))
    errors.push("Le contenu comporte du balisage exécutable : il est refusé.");

  const scan = scanPatientData(draft.subject, draft.body);
  if (scan.verdict === "blocking")
    errors.push(`Données patient détectées (${scan.markers.join(", ")}) : préparation bloquée.`);

  return {
    errors,
    patientVerdict: scan.verdict,
    markers: scan.markers,
    canPrepare: errors.length === 0,
  };
}
