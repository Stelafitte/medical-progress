import type { IsoDateTime, ProgramId } from "./types";

export type AssessmentDelivery = "in_person" | "remote_live" | "platform" | "external";
export type AssessmentContentKind = "qcm" | "ecos" | "oral" | "written" | "practical" | "portfolio";
export type AssessmentStatus = "draft" | "scheduled" | "open" | "completed" | "archived";
export type AssessmentResultMode = "platform" | "file_import" | "manual";

export interface AssessmentDefinition {
  readonly id: string;
  readonly programId: ProgramId;
  readonly title: string;
  readonly sequence: number;
  readonly delivery: AssessmentDelivery;
  readonly contentKinds: readonly AssessmentContentKind[];
  readonly status: AssessmentStatus;
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
  readonly locationOrProvider?: string;
  readonly resultMode: AssessmentResultMode;
  readonly maximumScore?: number;
  readonly passScore?: number;
}

export const ASSESSMENT_DELIVERY_LABELS_FR: Record<AssessmentDelivery, string> = {
  in_person: "En présentiel",
  remote_live: "À distance en direct",
  platform: "Dans la plateforme",
  external: "Hors plateforme",
};

export const ASSESSMENT_CONTENT_LABELS_FR: Record<AssessmentContentKind, string> = {
  qcm: "QCM",
  ecos: "ECOS de validation",
  oral: "Examen oral",
  written: "Épreuve écrite",
  practical: "Épreuve pratique",
  portfolio: "Portfolio / dossier",
};

export const ASSESSMENT_STATUS_LABELS_FR: Record<AssessmentStatus, string> = {
  draft: "Brouillon",
  scheduled: "Programmée",
  open: "Ouverte",
  completed: "Terminée",
  archived: "Archivée",
};

export const ASSESSMENT_RESULT_MODE_LABELS_FR: Record<AssessmentResultMode, string> = {
  platform: "Résultats produits dans la plateforme",
  file_import: "Résultats importés depuis un fichier",
  manual: "Résultats saisis manuellement",
};

export interface AssessmentIssue {
  readonly code: "missing_content" | "missing_schedule" | "invalid_schedule" | "invalid_score";
  readonly message: string;
}

export function validateAssessment(definition: AssessmentDefinition): readonly AssessmentIssue[] {
  const issues: AssessmentIssue[] = [];
  if (definition.contentKinds.length === 0)
    issues.push({ code: "missing_content", message: "Aucun contenu d'évaluation défini." });
  if (definition.status === "scheduled" && (!definition.startsAt || !definition.endsAt))
    issues.push({
      code: "missing_schedule",
      message: "Une évaluation programmée exige un début et une fin.",
    });
  if (definition.startsAt && definition.endsAt && definition.endsAt <= definition.startsAt)
    issues.push({ code: "invalid_schedule", message: "La fin doit être postérieure au début." });
  if (
    definition.maximumScore !== undefined &&
    definition.passScore !== undefined &&
    (definition.passScore < 0 || definition.passScore > definition.maximumScore)
  )
    issues.push({
      code: "invalid_score",
      message: "Le seuil de réussite doit être compris dans le barème.",
    });
  return issues;
}

export const ASSESSMENT_RESULT_IMPORT_REQUIRED_COLUMNS = [
  "learner_identifier",
  "score",
  "maximum_score",
  "result_status",
] as const;

export const QUESTION_BANK_CAPABILITIES = [
  "QCM à réponse unique ou multiple",
  "Images fixes à analyser",
  "GIF animés et boucles d'échocardiographie",
  "Versionnement, objectifs liés et historique des questions",
] as const;
