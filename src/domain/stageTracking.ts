/**
 * DE QUOI LA TRACE D'UN STAGE EST-ELLE FAITE ? — règle de domaine PURE.
 *
 * Décision de Stef, 16/09. « À la conception du programme, l'admin peut décider
 * qu'il y ait un stage mais que l'étudiant n'ait pas besoin d'un suivi de stage
 * avec validation de sa présence au quotidien. » Dans le DIU d'échocardiographie
 * l'apprenant ne renseigne jamais sa présence : il remplit un carnet de cas.
 *
 * LA CASE « JOURNAL DE STAGE » NE DIT DONC PLUS *SI* LE STAGE EST SUIVI — c'est
 * le module Stage du Concepteur qui décide qu'il EXISTE — elle dit COMMENT il
 * est tracé, parmi quatre formes cumulables.
 *
 * ⚠️ LA RÈGLE DE TRANSITION EST LA PLUS IMPORTANTE DE CE FICHIER. Tant qu'aucune
 * modalité « Journal de stage » ne porte de choix (`stageTracking` vide), on
 * garde le comportement d'avant le 16/09 : module Stage actif ⇒ suivi
 * dématérialisé. Sans cela, DFASM-CARDIO perdrait du jour au lendemain le
 * carnet de présence que ses étudiants remplissent déjà.
 */
import type { AssessmentModality } from "./assessmentModality";

export type StageTrackingMode =
  /** L'étudiant coche ses jours de présence et commente. C'est le carnet actuel. */
  | "presence_digital"
  /** L'étudiant remplit un carnet selon un MODÈLE (« 150 ETT, 50 ETO »). */
  | "logbook_digital"
  /** Carnet tenu sur papier, hors plateforme. */
  | "logbook_paper"
  /** Attestation du responsable de stage, hors plateforme. */
  | "supervisor_attestation";

export const STAGE_TRACKING_MODES: readonly StageTrackingMode[] = [
  "presence_digital",
  "logbook_digital",
  "logbook_paper",
  "supervisor_attestation",
];

export const STAGE_TRACKING_LABELS_FR: Record<StageTrackingMode, string> = {
  presence_digital: "Suivi de stage dématérialisé",
  logbook_digital: "Carnet de stage dématérialisé",
  logbook_paper: "Carnet de stage physique",
  supervisor_attestation: "Attestation du responsable de stage",
};

export const STAGE_TRACKING_HINTS_FR: Record<StageTrackingMode, string> = {
  presence_digital:
    "L'étudiant coche ses jours de présence et les commente ; l'encadrant valide par période.",
  logbook_digital:
    "L'étudiant remplit un carnet selon un modèle configuré (ex. 150 ETT, 50 ETO) ; l'encadrant confirme les comptes.",
  logbook_paper:
    "Tenu hors plateforme. Rien à remplir ici : le responsable de stage atteste l'avoir vu.",
  supervisor_attestation:
    "Hors plateforme. Le responsable de stage atteste, et c'est cette attestation que le bilan lit.",
};

/** Ce que le hub fait remplir à l'étudiant — par opposition à ce qui est attesté. */
export function estRempliDansLeHub(mode: StageTrackingMode): boolean {
  return mode === "presence_digital" || mode === "logbook_digital";
}

/**
 * Les formes de trace retenues pour un programme, toutes modalités confondues.
 * Une modalité archivée ou hors parcours n'est pas dans la liste reçue.
 */
export function tracesDuStage(
  modalities: readonly AssessmentModality[],
): readonly StageTrackingMode[] {
  const modes = new Set<StageTrackingMode>();
  for (const m of modalities) for (const mode of m.stageTracking ?? []) modes.add(mode);
  return STAGE_TRACKING_MODES.filter((mode) => modes.has(mode));
}

/**
 * L'étudiant doit-il tenir le suivi de présence ?
 *
 * VRAI si une modalité le demande — ou si AUCUNE ne dit rien, auquel cas on
 * retombe sur le comportement d'avant (module Stage actif = carnet ouvert).
 */
export function suiviDePresenceAttendu(
  modalities: readonly AssessmentModality[],
  placementsEnabled: boolean,
): boolean {
  if (!placementsEnabled) return false;
  const traces = tracesDuStage(modalities);
  if (traces.length === 0) return true;
  return traces.includes("presence_digital");
}

/** Le modèle de carnet servi au programme, s'il y en a un. */
export function modeleDeCarnetRetenu(
  modalities: readonly AssessmentModality[],
): string | undefined {
  for (const m of modalities) {
    if ((m.stageTracking ?? []).includes("logbook_digital") && m.stageLogTemplateId) {
      return m.stageLogTemplateId;
    }
  }
  return undefined;
}

/** Ce que l'apprenant déclare pour un item de son carnet, et son état. */
export interface StageLogbookReport {
  readonly id: string;
  readonly enrollmentId: string;
  readonly templateId: string;
  readonly objectiveKey: string;
  readonly declaredCount: number;
  readonly note: string;
  readonly updatedAt: string;
  /** Confirmé par un encadrant. Une déclaration modifiée reperd sa validation. */
  readonly validatedAt?: string;
  readonly validatedBy?: string;
}

/** Une trace tenue HORS plateforme, attestée par le responsable de stage. */
export interface StageAttestation {
  readonly id: string;
  readonly enrollmentId: string;
  readonly kind: Extract<StageTrackingMode, "logbook_paper" | "supervisor_attestation">;
  readonly note: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
}

/** L'avancement d'un item : ce qui est déclaré sur ce qui est attendu. */
export function avancementDeLItem(
  declared: number,
  quota: number,
): { readonly fait: number; readonly attendu: number; readonly pourcent: number } {
  const attendu = Math.max(0, quota);
  const fait = Math.max(0, declared);
  return {
    fait,
    attendu,
    pourcent: attendu === 0 ? 0 : Math.min(100, Math.round((fait / attendu) * 100)),
  };
}
