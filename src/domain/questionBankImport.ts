/**
 * L'import de la banque de questions — logique de domaine PURE.
 *
 * Deux responsabilités, et rien d'autre :
 *   1. lire le fichier `banque.json` produit hors du hub et le traduire dans
 *      la forme que la RPC `import_question_items` attend ;
 *   2. dire les quatre gestes possibles et ce qu'ils font, en clair.
 *
 * Le rapprochement question ↔ acquis se fait EN BASE, par code `ECN-xxx-yy`,
 * jamais ici : le client ne connaît pas le référentiel, et deviner un acquis
 * approximatif serait pire qu'écarter la question.
 */

export type ImportMode = "dry_run" | "merge" | "replace" | "delete";

/*
 * Le vocabulaire de l'écran (Stef, 15/09 : « rien ne stipule la fonction
 * Importation, le bouton n'est pas compréhensible »). Deux étapes, nommées
 * comme telles : on VÉRIFIE le fichier, puis on IMPORTE.
 */
export const IMPORT_MODE_LABELS_FR: Record<ImportMode, string> = {
  dry_run: "1. Vérifier le fichier",
  merge: "2. Importer — fusionner",
  replace: "2. Importer — remplacer",
  delete: "Supprimer la banque",
};

export const IMPORT_MODE_HINTS_FR: Record<ImportMode, string> = {
  dry_run:
    "Lit le fichier et rend le rapport : combien de questions trouvent leur acquis, combien seraient créées ou mises à jour. Rien n'est écrit.",
  merge:
    "Ajoute les questions nouvelles, met à jour celles déjà connues (même référence), garde le reste.",
  replace: "Retire tout ce qui porte cette source, puis importe le fichier en entier.",
  delete: "Retire tout ce qui porte cette source, sans lire de fichier.",
};

/** Une question telle que la RPC la reçoit. */
export interface ImportedQuestion {
  readonly external_ref: string;
  readonly outcome_code: string;
  readonly format: string;
  readonly stem: string;
  readonly commentary: string;
  readonly chapter: number | null;
  readonly section_label: string;
  readonly options: readonly {
    readonly letter: string;
    readonly body: string;
    readonly correct: boolean;
    readonly explanation: string;
  }[];
}

export interface ImportReport {
  readonly mode: ImportMode;
  readonly source: string;
  readonly matched: number;
  readonly unmatched: number;
  readonly unmatched_codes: readonly string[];
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly retired: number;
}

/** Additionne les rapports des lots : l'écran envoie par paquets de 100. */
export function mergeReports(reports: readonly ImportReport[]): ImportReport | null {
  const first = reports[0];
  if (!first) return null;
  const codes = new Set<string>();
  for (const r of reports) for (const c of r.unmatched_codes) codes.add(c);
  return reports.reduce(
    (acc, r) => ({
      ...acc,
      matched: acc.matched + r.matched,
      unmatched: acc.unmatched + r.unmatched,
      inserted: acc.inserted + r.inserted,
      updated: acc.updated + r.updated,
      deleted: acc.deleted + r.deleted,
      retired: acc.retired + r.retired,
    }),
    { ...first, matched: 0, unmatched: 0, inserted: 0, updated: 0, deleted: 0, retired: 0, unmatched_codes: [...codes].sort() },
  );
}

export type ParseIssue = "fichier_illisible" | "pas_de_questions" | "question_sans_reference";

export const PARSE_ISSUE_LABELS_FR: Record<ParseIssue, string> = {
  fichier_illisible: "Le fichier n'est pas un JSON lisible.",
  pas_de_questions: "Le fichier ne contient pas de tableau `questions`.",
  question_sans_reference: "Une question n'a ni identifiant ni code d'acquis : le fichier est incomplet.",
};

/**
 * Lit `banque.json` (forme produite le 12/09 : { metadata, questions[] }) et
 * rend les questions prêtes pour la RPC. Tolérant sur les champs absents,
 * strict sur les deux qui font l'identité : `id` et `outcome`.
 */
export function parseBanque(text: string):
  | { readonly ok: true; readonly questions: readonly ImportedQuestion[]; readonly chapters: number }
  | { readonly ok: false; readonly issue: ParseIssue } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issue: "fichier_illisible" };
  }
  const root = raw as { questions?: unknown };
  const list = Array.isArray(raw) ? raw : root?.questions;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, issue: "pas_de_questions" };

  const questions: ImportedQuestion[] = [];
  const chapters = new Set<number>();
  /* La forme du fichier, telle que produite le 12/09. Tout est optionnel sauf
     `id` et `outcome` : c'est le typage qui dit ce qu'on lit, pas un cast. */
  type OptionBrute = { letter?: unknown; text?: unknown; body?: unknown; correct?: unknown; explanation?: unknown };
  type QuestionBrute = {
    id?: unknown;
    outcome?: unknown;
    chapter?: unknown;
    stem?: unknown;
    commentary?: unknown;
    section?: unknown;
    section_title?: unknown;
    options?: unknown;
  };
  for (const q of list as QuestionBrute[]) {
    const id = String(q.id ?? "").trim();
    const outcome = String(q.outcome ?? "").trim();
    if (!id || !outcome) return { ok: false, issue: "question_sans_reference" };
    const chapter = typeof q.chapter === "number" ? q.chapter : null;
    if (chapter !== null) chapters.add(chapter);
    const options = Array.isArray(q.options) ? (q.options as OptionBrute[]) : [];
    questions.push({
      external_ref: id,
      outcome_code: outcome,
      format: "qrm",
      stem: String(q.stem ?? "").trim(),
      commentary: String(q.commentary ?? "").trim(),
      chapter,
      section_label: [q.section, q.section_title].filter(Boolean).join(" — "),
      options: options.map((o) => ({
        letter: String(o.letter ?? "").trim().toUpperCase(),
        body: String(o.text ?? o.body ?? "").trim(),
        correct: o.correct === true,
        explanation: String(o.explanation ?? "").trim(),
      })),
    });
  }
  return { ok: true, questions, chapters: chapters.size };
}

/** Par paquets : 1 493 questions × 5 options font ~4 Mo, trop pour un seul appel. */
export function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/*
 * Décisions de Stef, 15/09 — portées ici pour que l'écran de jeu, quand il
 * existera, n'ait pas à les réinventer.
 */

/** Affiché à l'étudiant avec chaque correction. */
export const AVERTISSEMENT_REFERENTIEL_FR =
  "Les réponses sont fondées sur le référentiel national CNEC 2026. Des décalages peuvent " +
  "exister avec des recommandations nationales ou internationales plus récentes : en cas de " +
  "doute, signalez la question, l'équipe pédagogique tranche.";

/** Qui reçoit un signalement : toute l'équipe d'encadrement du programme. */
export const DESTINATAIRES_SIGNALEMENT_FR =
  "Un signalement est visible de toute l'équipe d'encadrement du programme — encadrants, " +
  "responsables de stage et administrateurs — et traité par l'un d'eux.";
