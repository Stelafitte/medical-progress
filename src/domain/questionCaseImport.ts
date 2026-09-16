/**
 * L'import des DOSSIERS PROGRESSIFS (mini-DP) et KFP — logique de domaine pure.
 *
 * Le chat DEV EVALUATION produit `minidp_lot1.json` : { lot, generated,
 * source, cases: [{ id, chapter, item, validated, title, vignette,
 * steps: [{ n, reveal, format, expected?, outcome, stem, options: [{l, t, c,
 * flag?}], answer }] }] }. Ici on lit CETTE forme (et, par tolérance, la
 * forme du brief `format-dossiers-dp-kfp.md`) et on la traduit pour la RPC
 * `import_question_cases`. Le rapprochement étape ↔ acquis se fait en base.
 */

export interface ImportedCaseStep {
  readonly position: number;
  readonly format: string;
  readonly outcome_code: string;
  readonly reveal: string | null;
  readonly expected: number | null;
  readonly stem: string;
  readonly answer_note: string;
  readonly rank: string;
  readonly options: readonly {
    readonly letter: string;
    readonly body: string;
    readonly correct: boolean;
    readonly explanation: string;
    readonly flag: string;
  }[];
}

export interface ImportedCase {
  readonly external_ref: string;
  readonly kind: "mini_dp" | "kfp";
  readonly title: string;
  readonly vignette: string;
  readonly chapter: number | null;
  readonly chapter_title: string;
  readonly item_code: string;
  readonly validated: boolean;
  readonly steps: readonly ImportedCaseStep[];
}

export type CaseParseIssue = "fichier_illisible" | "pas_de_dossiers" | "dossier_incomplet";

export const CASE_PARSE_ISSUE_LABELS_FR: Record<CaseParseIssue, string> = {
  fichier_illisible: "Le fichier n'est pas un JSON lisible.",
  pas_de_dossiers: "Le fichier ne contient pas de tableau `cases` (ou `dossiers`).",
  dossier_incomplet:
    "Un dossier n'a pas d'identifiant, de vignette ou d'étapes : le fichier est incomplet.",
};

/** Un fichier est un lot de dossiers s'il porte `cases` ou `dossiers` — sinon c'est une banque de questions. */
export function estUnLotDeDossiers(text: string): boolean {
  try {
    const raw = JSON.parse(text) as { cases?: unknown; dossiers?: unknown };
    return Array.isArray(raw?.cases) || Array.isArray(raw?.dossiers);
  } catch {
    return false;
  }
}

const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const entier = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v)
    ? v
    : typeof v === "string" && /^\d+$/.test(v)
      ? Number(v)
      : null;

export function parseDossiers(
  text: string,
):
  | { readonly ok: true; readonly cases: readonly ImportedCase[]; readonly steps: number }
  | { readonly ok: false; readonly issue: CaseParseIssue } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issue: "fichier_illisible" };
  }
  const root = raw as { cases?: unknown; dossiers?: unknown };
  const list = Array.isArray(root?.cases)
    ? root.cases
    : Array.isArray(root?.dossiers)
      ? root.dossiers
      : null;
  if (!list || list.length === 0) return { ok: false, issue: "pas_de_dossiers" };

  type OptionBrute = {
    l?: unknown;
    t?: unknown;
    c?: unknown;
    flag?: unknown;
    letter?: unknown;
    text?: unknown;
    body?: unknown;
    correct?: unknown;
    explanation?: unknown;
  };
  type EtapeBrute = {
    n?: unknown;
    position?: unknown;
    reveal?: unknown;
    new_data?: unknown;
    format?: unknown;
    expected?: unknown;
    max_selection?: unknown;
    outcome?: unknown;
    stem?: unknown;
    options?: unknown;
    answer?: unknown;
    answer_note?: unknown;
    rank?: unknown;
  };
  type DossierBrut = {
    id?: unknown;
    kind?: unknown;
    chapter?: unknown;
    chapter_title?: unknown;
    item?: unknown;
    outcome?: unknown;
    validated?: unknown;
    title?: unknown;
    vignette?: unknown;
    steps?: unknown;
    questions?: unknown;
  };

  const cases: ImportedCase[] = [];
  let total = 0;
  for (const d of list as DossierBrut[]) {
    const id = texte(d.id);
    const vignette = texte(d.vignette);
    const etapes = Array.isArray(d.steps) ? d.steps : Array.isArray(d.questions) ? d.questions : [];
    if (!id || !vignette || etapes.length === 0) return { ok: false, issue: "dossier_incomplet" };
    const kind = texte(d.kind) === "kfp" ? "kfp" : "mini_dp";
    const item = d.item !== undefined ? String(d.item) : "";
    const outcome = texte(d.outcome);
    const steps: ImportedCaseStep[] = (etapes as EtapeBrute[]).map((s, i) => {
      const options = Array.isArray(s.options) ? (s.options as OptionBrute[]) : [];
      return {
        position: entier(s.n) ?? entier(s.position) ?? i + 1,
        format: texte(s.format) || "qrm",
        outcome_code: texte(s.outcome) || outcome,
        reveal: texte(s.reveal) || texte(s.new_data) || null,
        expected: entier(s.expected) ?? entier(s.max_selection),
        stem: texte(s.stem),
        answer_note: texte(s.answer) || texte(s.answer_note),
        rank: texte(s.rank).toUpperCase(),
        options: options.map((o) => ({
          letter: (texte(o.l) || texte(o.letter)).toUpperCase(),
          body: texte(o.t) || texte(o.text) || texte(o.body),
          correct: o.c === true || o.correct === true,
          explanation: texte(o.explanation),
          flag: texte(o.flag),
        })),
      };
    });
    total += steps.length;
    cases.push({
      external_ref: id,
      kind,
      title: texte(d.title) || id,
      vignette,
      chapter: entier(d.chapter),
      chapter_title: texte(d.chapter_title),
      item_code: item || (/^ECN-(\d+)-/.exec(outcome)?.[1] ?? ""),
      validated: d.validated === true,
      steps,
    });
  }
  return { ok: true, cases, steps: total };
}

/** Le vocabulaire des dossiers, pour les écrans. */
export const CASE_KIND_LABELS_FR: Record<ImportedCase["kind"], string> = {
  mini_dp: "Mini-DP",
  kfp: "KFP",
};

export const STEP_FORMAT_LABELS_FR: Readonly<Record<string, string>> = {
  qru: "Une seule réponse",
  qrm: "Plusieurs réponses",
  qrp_longue: "Réponses à choisir dans une liste longue",
  qroc: "Réponse courte",
  menu: "Liste déroulante",
};
