/**
 * Domaine de l'ADMINISTRATION (programme) et de l'ADMINISTRATION PLATEFORME.
 *
 * Distinction non négociable :
 * - l'administrateur de PROGRAMME gère les dossiers pédagogiques de SON programme ;
 * - l'administrateur de PLATEFORME supervise les programmes, les droits et les
 *   paramètres communs, sans accès automatique aux dossiers pédagogiques.
 */
import type { CampaignStatus, CommTemplateId } from "./communication";
import type { EnrollmentId, Id, IsoDateTime, PersonId, ProgramId } from "./types";

export type AdminDocumentId = Id<"AdminDocument">;
export type CompletionCertificateId = Id<"CompletionCertificate">;
export type AdminTaskId = Id<"AdminTask">;

/** Mention imposée partout où une conservation de données est évoquée. */
export const RETENTION_TBD_FR = "à définir avant backend";

export const EXPORT_NO_PATIENT_DATA_FR =
  "Aucune donnée patient n'est incluse dans les exports de la plateforme.";

export const NO_REAL_SEND_FR =
  "Aucun envoi réel : les messages sont uniquement affichés.";

/* ------------------------------------------------------------------ */
/* Pièces administratives                                              */
/* ------------------------------------------------------------------ */

export type AdminDocumentStatus = "missing" | "requested" | "received" | "validated" | "refused";

export const ADMIN_DOCUMENT_STATUS_LABELS_FR: Record<AdminDocumentStatus, string> = {
  missing: "manquante",
  requested: "demandée",
  received: "reçue",
  validated: "acceptée",
  refused: "refusée",
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

export type CertificateStatus =
  "not_requested" | "requested" | "reminded" | "signed" | "validated" | "revoked";

export const CERTIFICATE_STATUS_LABELS_FR: Record<CertificateStatus, string> = {
  not_requested: "non demandé",
  requested: "demandé",
  reminded: "relancé",
  signed: "signé par le responsable de stage",
  validated: "validé par l'administration du programme",
  revoked: "révoqué",
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

/*
 * IL N'Y A PLUS DE `MessageTemplate` ICI (17/09). Le dépôt en portait deux :
 * celui-ci, avec une « audience » en trois valeurs, et `CommMessageTemplate`
 * dans `communication.ts`, qui décrit exactement la table `message_templates`
 * — catégorie, canaux autorisés, variables déclarées, version, statut. Le
 * second est le bon, et c'est lui que la base sait rendre. Un modèle de
 * message ne porte d'ailleurs pas d'audience : l'audience est choisie par la
 * CAMPAGNE qui s'en sert.
 */

/**
 * Une campagne, vue depuis l'administration du programme : de quoi dire ce qui
 * est parti, à combien de personnes, et où ça en est. `state` porte le vrai
 * statut de la base — il y en a sept, pas un seul écrit en dur.
 */
export interface SendHistoryItem {
  readonly id: string;
  readonly programId: ProgramId;
  readonly templateId?: CommTemplateId;
  readonly subject: string;
  readonly preparedAt: IsoDateTime;
  readonly recipients: number;
  readonly state: CampaignStatus;
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

/** L'interrupteur IA, dit en clair. Aucun quota : la base n'en porte pas. */
export function aiStateLabel(enabled: boolean): string {
  return enabled ? "IA activée" : "IA éteinte";
}

export interface PlatformSupervisionRow {
  readonly programId: ProgramId;
  readonly programLabel: string;
  readonly authorizedAdministrators: readonly PersonId[];
  readonly learners: number;
  /** L'interrupteur IA du programme, tel que la base le porte. */
  readonly aiEnabled: boolean;
  /** Octets réellement stockés par les supports du programme. */
  readonly storageBytes: number;
}
