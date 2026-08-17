/**
 * Domaine de l'ADMINISTRATION (programme) et de l'ADMINISTRATION PLATEFORME.
 *
 * Distinction non négociable :
 * - l'administrateur de PROGRAMME gère les dossiers pédagogiques de SON programme ;
 * - l'administrateur de PLATEFORME supervise les programmes, les droits et les
 *   paramètres communs, sans accès automatique aux dossiers pédagogiques.
 */
import type { EnrollmentId, Id, IsoDateTime, PersonId, ProgramId } from "./types";

export type AdminDocumentId = Id<"AdminDocument">;
export type CompletionCertificateId = Id<"CompletionCertificate">;
export type AdminTaskId = Id<"AdminTask">;
export type MessageTemplateId = Id<"MessageTemplate">;

/** Mention imposée partout où une conservation de données est évoquée. */
export const RETENTION_TBD_FR = "à définir avant backend";

export const EXPORT_NO_PATIENT_DATA_FR =
  "Aucune donnée patient n'est incluse dans les exports de la plateforme.";

export const NO_REAL_SEND_FR =
  "Aucun envoi réel dans cette maquette : les messages sont uniquement affichés.";

/* ------------------------------------------------------------------ */
/* Pièces administratives                                              */
/* ------------------------------------------------------------------ */

export type AdminDocumentStatus = "requested" | "received" | "missing";

export const ADMIN_DOCUMENT_STATUS_LABELS_FR: Record<AdminDocumentStatus, string> = {
  requested: "demandée",
  received: "reçue",
  missing: "manquante",
};

export interface AdminDocument {
  readonly id: AdminDocumentId;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly label: string;
  readonly status: AdminDocumentStatus;
  readonly requestedOn?: IsoDateTime;
  readonly receivedOn?: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Certificat de complétude (workflow DIU)                             */
/* ------------------------------------------------------------------ */

export type CertificateStatus = "not_requested" | "requested" | "reminded" | "signed" | "validated";

export const CERTIFICATE_STATUS_LABELS_FR: Record<CertificateStatus, string> = {
  not_requested: "non demandé",
  requested: "demandé",
  reminded: "relancé",
  signed: "signé par le responsable de stage",
  validated: "validé par l'administration du programme",
};

export type CertificateAction = "request" | "remind" | "sign" | "validate";

/**
 * Transitions strictes du certificat de complétude.
 * `sign` est réservé au responsable de stage, `validate` à l'administration.
 */
export function nextCertificateStatus(
  current: CertificateStatus,
  action: CertificateAction,
): CertificateStatus | null {
  switch (action) {
    case "request":
      return current === "not_requested" ? "requested" : null;
    case "remind":
      return current === "requested" || current === "reminded" ? "reminded" : null;
    case "sign":
      return current === "requested" || current === "reminded" ? "signed" : null;
    case "validate":
      return current === "signed" ? "validated" : null;
    default:
      return null;
  }
}

export interface CompletionCertificate {
  readonly id: CompletionCertificateId;
  readonly programId: ProgramId;
  readonly enrollmentId: EnrollmentId;
  readonly status: CertificateStatus;
  readonly updatedAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Tâches et modèles de messages                                       */
/* ------------------------------------------------------------------ */

export interface AdminTask {
  readonly id: AdminTaskId;
  readonly programId: ProgramId;
  readonly label: string;
  readonly dueOn: IsoDateTime;
  readonly priority: "high" | "medium" | "low";
}

export interface MessageTemplate {
  readonly id: MessageTemplateId;
  readonly label: string;
  readonly audience: "individuel" | "groupe" | "promotion";
  readonly body: string;
}

export interface SendHistoryItem {
  readonly id: string;
  readonly programId: ProgramId;
  readonly templateId: MessageTemplateId;
  readonly audienceLabel: string;
  readonly preparedAt: IsoDateTime;
  readonly recipients: number;
  /** Toujours « préparé » : aucune expédition réelle. */
  readonly state: "prepared_not_sent";
}

/* ------------------------------------------------------------------ */
/* Périmètre                                                           */
/* ------------------------------------------------------------------ */

/** Cloisonnement : un administrateur de programme ne voit que son programme. */
export function scopedToProgram<T extends { readonly programId: ProgramId }>(
  items: readonly T[],
  programId: ProgramId,
): readonly T[] {
  return items.filter((i) => i.programId === programId);
}

/**
 * Invariant : l'administration plateforme n'ouvre jamais un dossier pédagogique.
 * Elle voit des compteurs et des paramètres, pas des preuves ni des carnets.
 */
export function platformAdminCanOpenLearnerFile(): false {
  return false;
}

export interface PlatformSupervisionRow {
  readonly programId: ProgramId;
  readonly programLabel: string;
  readonly authorizedAdministrators: readonly PersonId[];
  readonly learners: number;
  /** Quotas et consommation IA : prévus, jamais actifs dans cette maquette. */
  readonly aiQuotaLabel: string;
  readonly storageLabel: string;
}
