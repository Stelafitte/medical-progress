/**
 * Modalités d'évaluation — logique de domaine PURE.
 *
 * Une modalité d'évaluation décrit COMMENT on évalue (présentiel ou en ligne,
 * sous-type, usage prévu). Elle est rattachée à un programme et sert ensuite
 * aux sessions passées ou à venir de chaque cohorte.
 */
import type { IsoDateTime, ProgramId } from "./types";

export type AssessmentMode = "in_person" | "online";

/**
 * Le FORMAT de l'épreuve, indépendant du mode depuis le 14/09.
 *
 * Les sept premières clés décrivaient ce que le Hub sait exécuter lui-même.
 * Stef (13/09) a demandé que ce référentiel décrive ce que l'étudiant
 * rencontrera pendant son stage, que la plateforme fasse passer l'épreuve ou
 * non : une KFP sur table et un ECOS en présentiel n'étaient simplement pas
 * représentables. Les clés d'origine sont conservées telles quelles — aucune
 * ligne en base n'a été réécrite.
 */
export type AssessmentSubtype =
  // Formats d'origine (27/08).
  | "oral"
  | "written"
  | "practical"
  | "qcm"
  | "simulation"
  | "ai_oral"
  | "case_study"
  // Écrit de type EDN / R2C (14/09).
  | "qru"
  | "qroc"
  | "dp"
  | "mini_dp"
  | "kfp"
  | "tcs"
  | "lca"
  // Clinique observée (14/09).
  | "ecos"
  | "mini_cex"
  | "dops"
  | "portfolio";

export type AssessmentUsage = "self_assessment" | "formative" | "validation_exam" | "certification";

export const ASSESSMENT_MODE_LABELS_FR: Record<AssessmentMode, string> = {
  in_person: "En présentiel",
  online: "En ligne",
};

export const ASSESSMENT_SUBTYPE_LABELS_FR: Record<AssessmentSubtype, string> = {
  oral: "Épreuve orale",
  written: "Épreuve écrite (format libre)",
  practical: "Épreuve pratique",
  qcm: "QCM / QRM",
  simulation: "Simulation",
  ai_oral: "Évaluation orale par IA",
  case_study: "Cas clinique commenté",
  qru: "QRU (réponse unique)",
  qroc: "QROC (réponse ouverte courte)",
  dp: "Dossier progressif (DP)",
  mini_dp: "Mini-dossier progressif",
  kfp: "KFP (questions à éléments clés)",
  tcs: "TCS (concordance de script)",
  lca: "LCA (lecture critique d'article)",
  ecos: "ECOS",
  mini_cex: "Mini-CEX (rencontre clinique observée)",
  dops: "DOPS (geste technique observé)",
  portfolio: "Portfolio / carnet de stage",
};

export const ASSESSMENT_USAGE_LABELS_FR: Record<AssessmentUsage, string> = {
  self_assessment: "Auto-évaluation",
  formative: "Évaluation formative",
  validation_exam: "Examen de validation",
  certification: "Examen certifiant",
};

/**
 * Les sous-types groupés pour la LECTURE d'une liste de dix-huit entrées.
 *
 * Ce n'est plus une règle. `SUBTYPES_BY_MODE` disait quels formats un mode
 * autorisait, et la base le faisait respecter
 * (`assessment_modalities_subtype_matches_mode`). Les deux ont disparu le
 * 14/09 : le mode ne commande pas le format. Ce qui reste ici est un ordre
 * d'affichage — chaque sous-type figure dans exactement un groupe, et le test
 * le vérifie pour qu'un format ajouté sans groupe ne passe pas inaperçu.
 */
export const SUBTYPE_GROUPS_FR: readonly {
  readonly label: string;
  readonly subtypes: readonly AssessmentSubtype[];
}[] = [
  {
    label: "Écrit",
    subtypes: ["qcm", "qru", "qroc", "dp", "mini_dp", "kfp", "tcs", "lca", "written"],
  },
  {
    label: "Clinique observée",
    subtypes: ["ecos", "mini_cex", "dops", "practical", "portfolio"],
  },
  { label: "Oral", subtypes: ["oral", "ai_oral"] },
  { label: "Produit par la plateforme", subtypes: ["simulation", "case_study"] },
];

/**
 * Le mode PRÉSUMÉ d'un format, quand personne ne l'a choisi.
 *
 * Ce n'est pas une règle, c'est un défaut. Jusqu'au 14/09 le mode était
 * MÉCANIQUE : la base croisait mode et sous-type, et les deux écrans
 * d'import assisté par IA (`CorpusImport`, `ProgramAiReferentialAnalysis`)
 * n'avaient qu'à retourner la table. La contrainte est tombée, et avec elle
 * la déduction : une KFP se passe sur table ou sur tablette, et l'analyse
 * d'un document ne dit pas laquelle.
 *
 * Ces valeurs reproduisent EXACTEMENT l'ancien comportement pour les sept
 * formats d'origine — un import assisté produit ce qu'il produisait avant.
 * Les onze nouveaux suivent l'usage le plus courant. Une présomption fausse
 * se corrige dans l'onglet « Évaluations ».
 */
export const MODE_PRESUME_DU_FORMAT: Record<AssessmentSubtype, AssessmentMode> = {
  oral: "in_person",
  written: "in_person",
  practical: "in_person",
  qcm: "online",
  simulation: "online",
  ai_oral: "online",
  case_study: "online",
  qru: "online",
  qroc: "online",
  dp: "online",
  mini_dp: "online",
  kfp: "online",
  tcs: "online",
  lca: "online",
  ecos: "in_person",
  mini_cex: "in_person",
  dops: "in_person",
  portfolio: "online",
};

export interface AssessmentModality {
  readonly id: string;
  readonly programId: ProgramId;
  readonly name: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes?: string;
  /**
   * Non nul = retenue au parcours du programme ; absent = présente au
   * catalogue mais hors parcours. Même convention que `Outcome.retainedAt`.
   * Distinct de l'archivage, qui la sort de la liste.
   */
  readonly retainedAt?: IsoDateTime;
}

/** Saisie brute du formulaire unique de création de modalité. */
export interface NewAssessmentModalityInput {
  readonly name: string;
  readonly mode: AssessmentMode;
  readonly subtype: AssessmentSubtype;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

export const EMPTY_NEW_MODALITY_INPUT: NewAssessmentModalityInput = {
  name: "",
  mode: "in_person",
  subtype: "written",
  usage: "validation_exam",
  notes: "",
};

/**
 * `subtype-mismatch` a disparu le 14/09 avec la règle qu'elle faisait
 * respecter. Il ne reste qu'un refus : une modalité sans nom.
 */
export type NewModalityIssue = "name-required";

export const NEW_MODALITY_ISSUE_LABELS_FR: Record<NewModalityIssue, string> = {
  "name-required": "Le nom de la modalité d'évaluation est obligatoire.",
};

export function validateNewModality(
  input: NewAssessmentModalityInput,
): readonly NewModalityIssue[] {
  const issues: NewModalityIssue[] = [];
  if (input.name.trim().length === 0) issues.push("name-required");
  return issues;
}

/* ------------------------------------------------------------------ */
/* Épreuves datées                                                     */
/* ------------------------------------------------------------------ */

/**
 * Une épreuve datée : une modalité du programme, programmée pour une
 * promotion à une date. Table `assessment_sessions` (14/09 soir).
 *
 * Les auto-évaluations n'en ont pas — elles sont « en continu ». Les
 * résultats (notes, réussite) restent hors périmètre : ils viendront
 * s'accrocher ici, pas remplacer ceci.
 */
export interface AssessmentSession {
  readonly id: string;
  readonly programId: ProgramId;
  readonly modalityId: string;
  readonly cohortId: string;
  /** Date civile, `AAAA-MM-JJ`. Pas d'heure : la convocation la précise. */
  readonly scheduledOn: string;
  /** Fin de la fenêtre d'accès. Absente = épreuve d'un jour. (15/09) */
  readonly closesOn?: string;
  readonly location?: string;
  readonly notes?: string;
  /** Pour un QCM : la série que la fenêtre sert. (15/09) */
  readonly config?: QcmWindowConfig;
}

/**
 * Ce qu'une fenêtre de QCM sert : quels thèmes, quels rangs, combien de
 * questions. Tableaux vides = pas de filtre. `milestoneId` garde la trace du
 * jalon dont la fenêtre a été tirée, pour l'écran — le serveur ne s'en sert
 * pas.
 */
export interface QcmWindowConfig {
  readonly themeIds: readonly string[];
  readonly ranks: readonly ("A" | "B" | "C")[];
  readonly count: number;
  readonly milestoneId?: string;
  /** Items (chapitres de la banque) et sous-items (clés « chapitre|section ») ; vides = tous. */
  readonly chapters?: readonly number[];
  readonly sections?: readonly string[];
}

/** Une fenêtre est ouverte du matin de `scheduledOn` au soir de `closesOn` (ou du même jour). */
export type WindowState = "upcoming" | "open" | "closed";

export function windowState(session: AssessmentSession, now: Date): WindowState {
  const debut = new Date(`${session.scheduledOn}T00:00:00`);
  const fin = new Date(`${session.closesOn ?? session.scheduledOn}T23:59:59`);
  if (now.getTime() < debut.getTime()) return "upcoming";
  if (now.getTime() > fin.getTime()) return "closed";
  return "open";
}

export type AssessmentSessionState = "completed" | "upcoming";

/** Une épreuve est passée dès la fin de son jour, pas à minuit le matin. */
export function sessionState(session: AssessmentSession, now: Date): AssessmentSessionState {
  const finDuJour = new Date(`${session.scheduledOn}T23:59:59`);
  return finDuJour.getTime() <= now.getTime() ? "completed" : "upcoming";
}

export function splitSessions(
  sessions: readonly AssessmentSession[],
  now: Date,
): {
  readonly completed: readonly AssessmentSession[];
  readonly upcoming: readonly AssessmentSession[];
} {
  const byDate = [...sessions].sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
  return {
    completed: byDate.filter((s) => sessionState(s, now) === "completed"),
    upcoming: byDate.filter((s) => sessionState(s, now) === "upcoming"),
  };
}

/** Les usages qui se DATENT. Une auto-évaluation est en continu. */
export function usageSeDate(usage: AssessmentUsage): boolean {
  return usage !== "self_assessment";
}

/**
 * « Cette promotion utilise cette modalité. » Table
 * `cohort_assessment_modalities` (14/09, tard). La modalité est configurée une
 * fois pour le programme ; chaque promotion décide de la servir, et quand.
 */
export interface CohortAssessmentLink {
  readonly programId: ProgramId;
  readonly cohortId: string;
  readonly modalityId: string;
  /** Ouvert / fermé à la main. Fermé : l'étudiant voit, ne lance rien. (15/09) */
  readonly isOpen: boolean;
  /** Pour un QCM : la banque servie (`question_items.source`). */
  readonly questionSource?: string;
  /** Pour un QCM : « je m'évalue maintenant » autorisé. */
  readonly freeAccess: boolean;
}
