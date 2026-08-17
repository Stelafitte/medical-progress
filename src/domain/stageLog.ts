/**
 * Carnet de stage GÉNÉRIQUE et CONFIGURABLE (module de domaine pur).
 *
 * Un seul moteur sert tous les programmes (DIU d'Échocardiographie, DFASM
 * Cardiologie, programmes futurs) : seule la configuration du modèle change.
 *
 * Règles structurantes non négociables :
 * - la photo est un fragment de document explicitement autorisé par
 *   l'administrateur, jamais un document intégral ;
 * - aucune photo ne peut être jointe sans checklist complète ET déclaration
 *   explicite de l'apprenant ;
 * - aucune acquisition n'est jamais dérivée d'une photo : toute compétence
 *   réelle exige une validation humaine ;
 * - aucun champ patient nominatif n'existe dans le modèle.
 */
import type {
  CohortId,
  Entity,
  EnrollmentId,
  Id,
  IsoDateTime,
  PersonId,
  PlacementAssignmentId,
  ProgramId,
  Provenance,
  RoleName,
} from "./types";

export type StageLogTemplateId = Id<"StageLogTemplate">;
export type StageLogId = Id<"StageLog">;
export type StageLogEntryId = Id<"StageLogEntry">;
export type PhotoRequirementId = Id<"PhotoRequirement">;

/* ------------------------------------------------------------------ */
/* Modèle de carnet (configuration administrateur)                     */
/* ------------------------------------------------------------------ */

export type StageLogFieldKind = "text" | "long_text" | "choice" | "count" | "autonomy";

export interface StageLogField {
  readonly key: string;
  readonly label: string;
  readonly kind: StageLogFieldKind;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly helpText?: string;
}

export type StageLogFrequency = "per_entry" | "weekly" | "per_placement" | "per_semester";

export interface StageLogObjective {
  readonly key: string;
  readonly label: string;
  /** Quota attendu (nombre d'activités / examens). */
  readonly quota: number;
  readonly frequency: StageLogFrequency;
}

/** Objet de photo autorisé : défini par l'administrateur, jamais libre côté apprenant. */
export interface PhotoRequirement {
  readonly id: PhotoRequirementId;
  /** Libellé exact de l'objet autorisé (ex. « Histoire de la maladie (HDM) »). */
  readonly label: string;
  /** Consigne de cadrage affichée avant toute prise de vue. */
  readonly framingInstruction: string;
  readonly required: boolean;
  /** Objet personnalisé saisi par l'administrateur (hors liste prédéfinie). */
  readonly custom: boolean;
}

export interface StageLogPhotoPolicy {
  /** Section « Photos autorisées » activée dans le modèle. */
  readonly enabled: boolean;
  readonly allowedObjects: readonly PhotoRequirement[];
  /** Autorise un objet personnalisé, toujours choisi dans le modèle du programme. */
  readonly allowCustomObject: boolean;
  readonly maxPhotosPerEntry: number;
  readonly supervisorValidationRequired: boolean;
  /** Toujours libellé « à définir avant backend » dans cette itération. */
  readonly retentionPolicyLabel: string;
  /** Contrôle automatique (OCR / détection) NON actif : jamais une garantie. */
  readonly automaticCheck: "not_active";
}

export interface StageLogTemplate extends Entity<StageLogTemplateId> {
  readonly programId: ProgramId;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  /** Module ou cursus concerné (ex. « Module 2 — Échocardiographie clinique »). */
  readonly moduleLabel: string;
  /** Cohortes activées : liste vide = toutes les cohortes du programme. */
  readonly cohortIds: readonly CohortId[];
  readonly enabled: boolean;
  readonly fields: readonly StageLogField[];
  readonly objectives: readonly StageLogObjective[];
  readonly entryFrequency: StageLogFrequency;
  readonly validatorRole: Extract<RoleName, "placement_supervisor" | "teacher">;
  readonly completenessRules: readonly string[];
  readonly photoPolicy: StageLogPhotoPolicy;
}

/* ------------------------------------------------------------------ */
/* Carnet, entrées, pièces jointes                                     */
/* ------------------------------------------------------------------ */

export type StageLogStatus =
  | "draft"
  | "submitted"
  | "needs_revision"
  | "validated"
  | "transmitted";

export const STAGE_LOG_STATUS_LABELS_FR: Record<StageLogStatus, string> = {
  draft: "brouillon",
  submitted: "soumis",
  needs_revision: "à corriger",
  validated: "validé par le responsable de stage",
  transmitted: "transmis à l'administration du programme",
};

/**
 * Pièce jointe de DÉMONSTRATION : aucune image réelle n'est stockée, seules
 * des métadonnées mock et un placeholder existent.
 */
export interface StageLogPhotoAttachment {
  readonly requirementId: PhotoRequirementId;
  readonly requirementLabel: string;
  readonly placeholderName: string;
  readonly attachedAt: IsoDateTime;
  /** Déclaration explicite de l'apprenant (obligatoire). */
  readonly declaredNoIdentifiers: true;
  readonly checklistAcknowledged: readonly PhotoChecklistKey[];
  /** Aucune anonymisation garantie : contrôle automatique futur non actif. */
  readonly automaticCheck: "not_active";
  readonly storage: "mock_placeholder";
}

export interface StageLogEntry extends Entity<StageLogEntryId> {
  readonly stageLogId: StageLogId;
  readonly templateId: StageLogTemplateId;
  readonly occurredAt: IsoDateTime;
  readonly values: Readonly<Record<string, string>>;
  readonly photos: readonly StageLogPhotoAttachment[];
}

export interface StageLogValidation {
  readonly stageLogId: StageLogId;
  readonly validatorPersonId: PersonId;
  readonly validatorRole: Extract<RoleName, "placement_supervisor" | "teacher" | "administrator">;
  readonly decision: "validated" | "needs_revision";
  readonly decidedAt: IsoDateTime;
  readonly comment?: string;
  readonly provenance: Provenance;
}

export interface StageLog extends Entity<StageLogId> {
  readonly templateId: StageLogTemplateId;
  readonly templateVersion: number;
  readonly programId: ProgramId;
  readonly cohortId: CohortId;
  readonly enrollmentId: EnrollmentId;
  readonly placementAssignmentId?: PlacementAssignmentId;
  readonly status: StageLogStatus;
  readonly entries: readonly StageLogEntry[];
  readonly validations: readonly StageLogValidation[];
}

/* ------------------------------------------------------------------ */
/* Checklist photo (obligatoire, identique pour tous les programmes)   */
/* ------------------------------------------------------------------ */

export type PhotoChecklistKey =
  | "no_name"
  | "no_birth_date"
  | "no_record_identifier"
  | "no_barcode"
  | "framing_limited";

export interface PhotoChecklistItem {
  readonly key: PhotoChecklistKey;
  readonly label: string;
}

export const PHOTO_CHECKLIST: readonly PhotoChecklistItem[] = [
  { key: "no_name", label: "Aucun nom ni prénom visible" },
  { key: "no_birth_date", label: "Aucune date de naissance visible" },
  { key: "no_record_identifier", label: "Aucun identifiant de dossier, de séjour, IPP ou NIP" },
  { key: "no_barcode", label: "Aucun code-barres ni QR code" },
  { key: "framing_limited", label: "Cadrage limité au seul fragment demandé" },
];

export const PHOTO_BANNER_FR =
  "Ne photographiez que le fragment demandé. En cas de doute, utilisez la saisie manuelle.";

export const PHOTO_DECLARATION_FR =
  "Je confirme avoir vérifié l'absence de tout élément nominatif";

export const PHOTO_NO_GUARANTEE_FR =
  "Contrôle automatique futur non actif : aucune anonymisation n'est garantie par la plateforme.";

export const PHOTO_RETENTION_TBD_FR = "à définir avant backend";

/* ------------------------------------------------------------------ */
/* Règles pures                                                        */
/* ------------------------------------------------------------------ */

/** Modèles applicables à un contexte programme / cohorte donné. */
export function templatesForContext(
  templates: readonly StageLogTemplate[],
  context: { readonly programId: ProgramId; readonly cohortId?: CohortId },
): readonly StageLogTemplate[] {
  return templates.filter(
    (t) =>
      t.enabled &&
      t.programId === context.programId &&
      (t.cohortIds.length === 0 || !context.cohortId || t.cohortIds.includes(context.cohortId)),
  );
}

/** La photo est-elle proposée par ce modèle ? */
export function isPhotoAllowed(template: StageLogTemplate): boolean {
  return template.photoPolicy.enabled && template.photoPolicy.allowedObjects.length > 0;
}

export function photoRequirement(
  template: StageLogTemplate,
  requirementId: PhotoRequirementId | null,
): PhotoRequirement | undefined {
  if (!requirementId) return undefined;
  return template.photoPolicy.allowedObjects.find((o) => o.id === requirementId);
}

export interface PhotoAttachDraft {
  readonly requirementId: PhotoRequirementId | null;
  readonly checked: readonly PhotoChecklistKey[];
  readonly declarationConfirmed: boolean;
  readonly currentPhotoCount: number;
}

export interface PhotoAttachDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/**
 * Décision unique et testable : peut-on joindre la photo ?
 * Sans objet autorisé, sans checklist complète ou sans déclaration cochée,
 * la réponse est toujours non.
 */
export function evaluatePhotoAttach(
  template: StageLogTemplate,
  draft: PhotoAttachDraft,
): PhotoAttachDecision {
  const reasons: string[] = [];
  if (!isPhotoAllowed(template)) {
    reasons.push("Ce modèle de carnet n'autorise aucune photo.");
    return { allowed: false, reasons };
  }
  const requirement = photoRequirement(template, draft.requirementId);
  if (!requirement) reasons.push("Sélectionnez l'objet de photo autorisé par l'administrateur.");
  const missing = PHOTO_CHECKLIST.filter((item) => !draft.checked.includes(item.key));
  if (missing.length > 0)
    reasons.push(
      `Checklist incomplète : ${missing.map((m) => m.label.toLowerCase()).join(" ; ")}.`,
    );
  if (!draft.declarationConfirmed) reasons.push(`Case obligatoire : « ${PHOTO_DECLARATION_FR} ».`);
  if (draft.currentPhotoCount >= template.photoPolicy.maxPhotosPerEntry)
    reasons.push(
      `Nombre maximal de photos atteint (${template.photoPolicy.maxPhotosPerEntry}) pour cette entrée.`,
    );
  return { allowed: reasons.length === 0, reasons };
}

/** Construit la pièce jointe de démonstration (jamais d'image réelle). */
export function buildPlaceholderAttachment(
  requirement: PhotoRequirement,
  now: IsoDateTime,
): StageLogPhotoAttachment {
  return {
    requirementId: requirement.id,
    requirementLabel: requirement.label,
    placeholderName: `placeholder-fragment-${requirement.id}.png`,
    attachedAt: now,
    declaredNoIdentifiers: true,
    checklistAcknowledged: PHOTO_CHECKLIST.map((i) => i.key),
    automaticCheck: "not_active",
    storage: "mock_placeholder",
  };
}

/** Complétude d'une entrée : champs obligatoires + photos obligatoires du modèle. */
export function isEntryComplete(template: StageLogTemplate, entry: StageLogEntry): boolean {
  const fieldsOk = template.fields
    .filter((f) => f.required)
    .every((f) => (entry.values[f.key] ?? "").trim().length > 0);
  const requiredPhotos = template.photoPolicy.enabled
    ? template.photoPolicy.allowedObjects.filter((o) => o.required)
    : [];
  const photosOk = requiredPhotos.every((o) =>
    entry.photos.some((p) => p.requirementId === o.id),
  );
  return fieldsOk && photosOk;
}

export type StageLogAction = "submit" | "request_revision" | "validate" | "transmit";

/**
 * Workflow : brouillon → soumis → à corriger ou validé → transmis.
 * « Transmis » est un état interne de l'application, jamais un envoi par e-mail.
 */
export function nextStageLogStatus(
  current: StageLogStatus,
  action: StageLogAction,
  actorRoles: readonly RoleName[],
): StageLogStatus | null {
  const isValidator =
    actorRoles.includes("placement_supervisor") || actorRoles.includes("teacher");
  const isAdmin = actorRoles.includes("administrator");
  switch (action) {
    case "submit":
      return actorRoles.includes("learner") && (current === "draft" || current === "needs_revision")
        ? "submitted"
        : null;
    case "request_revision":
      return isValidator && current === "submitted" ? "needs_revision" : null;
    case "validate":
      return isValidator && current === "submitted" ? "validated" : null;
    case "transmit":
      return isAdmin && current === "validated" ? "transmitted" : null;
    default:
      return null;
  }
}

/**
 * Invariant explicite : une photo ne déclenche JAMAIS d'acquisition.
 * Toute compétence réelle passe par une validation humaine.
 */
export function canDeriveAcquisitionFromPhoto(): false {
  return false;
}
