/**
 * Import d'un référentiel d'acquis collé — logique de domaine pure.
 *
 * Le pendant de `cohortRoster` pour les acquis : on colle un tableau (le
 * référentiel du collège, la table `competencies` d'une autre plateforme, un
 * export de scolarité) et on en tire des thèmes et des acquis contrôlés.
 *
 * La lecture du tableau — séparateur, ligne d'en-tête, guillemets — est
 * commune, dans `delimitedTable`. Ici ne vit que ce qui est propre aux acquis :
 * reconnaître les colonnes, traduire un niveau, deviner une nature, regrouper
 * par thème, et fabriquer un code quand la source n'en porte pas.
 *
 * Rien n'est écrit : ce module rend une PRÉVISUALISATION. Ce qui est deviné
 * doit rester visible et corrigeable avant la moindre création.
 */
import {
  detectMapping,
  parseDelimitedTable,
  type ColumnMapping,
  type HeaderAliases,
} from "./delimitedTable";
import type { KnowledgeRank, MasteryLevel, OutcomeNature } from "./types";

export const OUTCOME_COLUMNS = [
  "theme",
  "themeLabel",
  "order",
  "code",
  "label",
  "description",
  "nature",
  "level",
  "scope",
  "rank",
] as const;

export type OutcomeColumn = (typeof OUTCOME_COLUMNS)[number];

export const OUTCOME_COLUMN_LABELS_FR: Record<OutcomeColumn, string> = {
  theme: "Thème (numéro ou libellé)",
  themeLabel: "Libellé du thème",
  order: "Ordre dans le thème",
  code: "Code (facultatif, sinon engendré)",
  label: "Intitulé de l'acquis",
  description: "Description",
  nature: "Nature (connaissance / compétence)",
  level: "Niveau attendu",
  scope: "Portée (générique / spécialisé)",
  rank: "Rang de connaissance (A / B / C)",
};

/** Sans intitulé, il n'y a rien à créer. Le reste se déduit ou se choisit. */
export const OUTCOME_REQUIRED_COLUMNS: readonly OutcomeColumn[] = ["label"];

const HEADER_ALIASES: HeaderAliases<OutcomeColumn> = {
  theme: ["theme", "thème", "chapitre", "bloc", "block", "categorie", "catégorie", "partie"],
  themeLabel: [
    "theme label",
    "libelle du theme",
    "libellé du thème",
    "intitule du theme",
    "nom du theme",
    "chapitre libelle",
  ],
  // ATTENTION : « rang » n'est PAS ici. Il a longtemps servi d'alias d'`order`,
  // mais dans un referentiel medical « Rang » designe le rang R2C (A / B / C),
  // pas un numero d'ordre. Le laisser aux deux endroits ferait lire la colonne
  // de rang comme un ordre, et « A » n'etant pas un nombre, l'ordre retomberait
  // en silence sur le rang d'apparition. Un test verrouille ce point.
  order: ["order in theme", "ordre", "ordre dans le theme", "position", "numero", "n", "index"],
  code: ["code", "reference", "référence", "identifiant", "id item", "item"],
  label: [
    "label",
    "libelle",
    "libellé",
    "intitule",
    "intitulé",
    "acquis",
    "competence",
    "compétence",
    "connaissance",
    "objectif",
    "enonce",
    "énoncé",
    "titre",
  ],
  description: ["description", "detail", "détail", "commentaire", "precision", "précision"],
  nature: ["nature", "type", "type d acquis", "categorie d acquis"],
  level: [
    "level",
    "niveau",
    "niveau attendu",
    "niveau cible",
    "target",
    "target mastery",
    "maitrise",
    "maîtrise",
  ],
  scope: [
    "scope",
    "portee",
    "portée",
    "domaine",
    "domain",
    "specialite",
    "spécialité",
    "transversal",
  ],
  rank: [
    "rang",
    "rang de connaissance",
    "rang r2c",
    "hierarchisation",
    "hiérarchisation",
    "hierarchisation des connaissances",
    "niveau de connaissance",
    "knowledge rank",
  ],
};

/* ------------------------------------------------------------------ */
/* Traductions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Le niveau attendu, tel qu'il s'écrit dans les référentiels réels.
 *
 * L'échelle de myDFASM (base / avancé / expert) n'a que trois crans, celle du
 * socle en a cinq. La correspondance est un choix, pas une évidence : « base »
 * n'est pas « débutant », c'est ce qu'on attend de tout étudiant en fin de
 * stage. On le place donc à `intermediate`, pas à `novice`.
 */
const LEVEL_WORDS: Record<string, MasteryLevel> = {
  base: "intermediate",
  basique: "intermediate",
  socle: "intermediate",
  avance: "proficient",
  avancé: "proficient",
  confirme: "proficient",
  confirmé: "proficient",
  expert: "autonomous",
  autonome: "autonomous",
  // L'échelle du socle, acceptée telle quelle.
  not_started: "not_started",
  non_commence: "not_started",
  novice: "novice",
  decouverte: "novice",
  découverte: "novice",
  intermediate: "intermediate",
  intermediaire: "intermediate",
  intermédiaire: "intermediate",
  proficient: "proficient",
  maitrise: "proficient",
  maîtrise: "proficient",
  autonomous: "autonomous",
};

const NATURE_WORDS: Record<string, OutcomeNature> = {
  connaissance: "knowledge",
  connaissances: "knowledge",
  knowledge: "knowledge",
  savoir: "knowledge",
  theorie: "knowledge",
  théorie: "knowledge",
  "competence simulee": "simulated_competence",
  "compétence simulée": "simulated_competence",
  simulation: "simulated_competence",
  simulee: "simulated_competence",
  simulée: "simulated_competence",
  simulated_competence: "simulated_competence",
  competence: "real_competence",
  compétence: "real_competence",
  "competence reelle": "real_competence",
  "compétence réelle": "real_competence",
  reelle: "real_competence",
  réelle: "real_competence",
  geste: "real_competence",
  "savoir-faire": "real_competence",
  real_competence: "real_competence",
};

function normaliseWord(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseLevel(value: string): MasteryLevel | undefined {
  return LEVEL_WORDS[normaliseWord(value)];
}

export function parseNature(value: string): OutcomeNature | undefined {
  return NATURE_WORDS[normaliseWord(value)];
}

/**
 * Le rang R2C tel qu'il s'ecrit dans les sources reelles : « A », « rang A »,
 * « Rang B » — et rien d'autre. On refuse de deviner : un rang mal lu se
 * propagerait silencieusement sur des centaines de lignes.
 */
export function parseKnowledgeRank(value: string): KnowledgeRank | undefined {
  const match = /^(?:rang\s*)?([abc])$/.exec(normaliseWord(value));
  return match ? (match[1]!.toUpperCase() as KnowledgeRank) : undefined;
}

/**
 * Un code lisible engendré depuis le thème et le rang, quand la source n'en
 * porte pas — le cas de myDFASM, dont la table n'a pas de code.
 *
 * Volontairement lisible plutôt qu'opaque : « T3-07 » se retrouve à l'oeil dans
 * une liste, un identifiant technique non.
 */
export function generateCode(themePosition: number, order: number): string {
  return `T${themePosition}-${String(order).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Prévisualisation                                                    */
/* ------------------------------------------------------------------ */

export type OutcomeRowStatus =
  /** Code libre : l'acquis sera créé. */
  | "ready"
  /** Code déjà porté par un acquis ACTIF, et quelque chose diffère : révision. */
  | "to_update"
  /** Code déjà porté par un acquis actif, rien ne diffère : la ligne est passée. */
  | "unchanged"
  | "duplicate_in_file"
  /** Code pris par un acquis ARCHIVÉ : ni créable, ni révisable. */
  | "already_present"
  | "invalid";

/** Ce qu'une révision changerait sur une ligne, champ par champ. */
export interface OutcomeChange {
  readonly field: "label" | "description" | "level" | "rank";
  readonly before: string;
  readonly after: string;
}

export const OUTCOME_CHANGE_LABELS_FR: Record<OutcomeChange["field"], string> = {
  label: "intitulé",
  description: "description",
  level: "niveau attendu",
  rank: "rang",
};

/**
 * Un acquis déjà en base, tel qu'il faut le connaître pour décider si une ligne
 * du fichier le change. Volontairement plus étroit que `Outcome` : le domaine
 * n'a pas besoin des dates ni de la provenance.
 */
export interface ExistingOutcome {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly nature: OutcomeNature;
  readonly targetMastery: MasteryLevel;
  readonly knowledgeRank?: KnowledgeRank;
}

export interface OutcomeIssue {
  readonly line: number;
  readonly column?: OutcomeColumn | undefined;
  readonly level: "error" | "warning";
  readonly message: string;
}

export interface OutcomeCandidate {
  readonly line: number;
  readonly themeKey: string;
  readonly themeLabel: string;
  readonly code: string;
  /** Vrai quand le code a été engendré faute de colonne dans la source. */
  readonly codeGenerated: boolean;
  readonly label: string;
  readonly description: string;
  readonly nature: OutcomeNature;
  readonly natureAssumed: boolean;
  readonly targetMastery: MasteryLevel;
  readonly scope: string;
  /** Rang R2C lu dans la source. Absent = non hiérarchisé. */
  readonly knowledgeRank?: KnowledgeRank;
  readonly order: number;
  readonly status: OutcomeRowStatus;
  /** Renseigné pour `to_update` et `unchanged` : l'acquis que cette ligne vise. */
  readonly outcomeId?: string;
  /** Ce que la révision changerait. Vide pour toute autre situation. */
  readonly changes: readonly OutcomeChange[];
  readonly issues: readonly OutcomeIssue[];
}

export interface OutcomeThemeDraft {
  readonly key: string;
  readonly label: string;
  readonly position: number;
  readonly outcomes: readonly OutcomeCandidate[];
}

export interface OutcomeRosterPreview {
  readonly mapping: ColumnMapping<OutcomeColumn>;
  readonly missingRequiredColumns: readonly OutcomeColumn[];
  readonly delimiter: string;
  readonly headerLine: number;
  readonly themes: readonly OutcomeThemeDraft[];
  readonly candidates: readonly OutcomeCandidate[];
  readonly readyCount: number;
  readonly duplicateCount: number;
  readonly alreadyPresentCount: number;
  readonly invalidCount: number;
  /** Codes engendrés faute de colonne : à signaler, jamais à taire. */
  readonly generatedCodeCount: number;
  /** Natures déduites du défaut, faute de colonne : à faire confirmer. */
  readonly natureAssumedCount: number;
  /** Lignes qui portent un rang R2C lisible. */
  readonly rankedCount: number;
  readonly toUpdateCount: number;
  readonly unchangedCount: number;
  /**
   * Acquis du programme, de l'une des natures présentes dans le fichier, dont
   * le code ne figure PAS dans le fichier. Purement informatif : un fichier
   * partiel ou tronqué ne doit jamais vider un référentiel tout seul.
   */
  readonly missingFromFile: readonly { readonly code: string; readonly label: string }[];
  readonly issues: readonly OutcomeIssue[];
  readonly canImport: boolean;
}

export interface BuildOutcomeRosterInput {
  readonly text: string;
  readonly mapping?: ColumnMapping<OutcomeColumn>;
  /**
   * Codes déjà PRIS dans le programme, archivés compris — pas seulement les
   * actifs. `unique (program_id, code)` ne distingue pas les deux : comparer
   * aux seuls codes visibles annoncerait « à créer » des lignes que la base
   * refusera une par une.
   */
  readonly existingCodes?: readonly string[];
  /**
   * Les acquis ACTIFS du programme, pour comparer plutôt que d'ignorer. Une
   * ligne dont le code s'y trouve devient une révision (`to_update`) ou un
   * constat d'identité (`unchanged`), au lieu d'être écartée en silence.
   */
  readonly existingOutcomes?: readonly ExistingOutcome[];
  /** Nature retenue quand le tableau n'en porte pas. */
  readonly defaultNature?: OutcomeNature;
  /** Niveau retenu quand le tableau n'en porte pas. */
  readonly defaultLevel?: MasteryLevel;
}

export function detectOutcomeMapping(headers: readonly string[]): ColumnMapping<OutcomeColumn> {
  return detectMapping(headers, HEADER_ALIASES);
}

export function buildOutcomeRosterPreview(input: BuildOutcomeRosterInput): OutcomeRosterPreview {
  const parsed = parseDelimitedTable(input.text, HEADER_ALIASES);
  const mapping = { ...detectOutcomeMapping(parsed.headers), ...(input.mapping ?? {}) };
  const defaultNature = input.defaultNature ?? "real_competence";
  const defaultLevel = input.defaultLevel ?? "proficient";
  const existing = new Set((input.existingCodes ?? []).map((c) => c.trim().toUpperCase()));
  const byCode = new Map(
    (input.existingOutcomes ?? []).map((o) => [o.code.trim().toUpperCase(), o]),
  );

  const missingRequiredColumns = OUTCOME_REQUIRED_COLUMNS.filter((c) => mapping[c] === undefined);

  const issues: OutcomeIssue[] = [];
  if (parsed.headers.length === 0) {
    issues.push({ line: 1, level: "error", message: "Tableau vide : aucune ligne d'en-tête." });
  }
  for (const column of missingRequiredColumns) {
    issues.push({
      line: parsed.headerLine,
      column,
      level: "error",
      message: `Colonne obligatoire absente : ${OUTCOME_COLUMN_LABELS_FR[column]}.`,
    });
  }

  // Les thèmes sont découverts dans l'ordre d'apparition : c'est l'ordre du
  // référentiel source, et il a un sens pédagogique qu'un tri alphabétique
  // détruirait.
  const themeOrder: string[] = [];
  const themeLabels = new Map<string, string>();
  const seenCodes = new Set<string>();
  const candidates: OutcomeCandidate[] = [];
  const orderWithinTheme = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const line = parsed.headerLine + index + 1;
    const cell = (column: OutcomeColumn): string => {
      const at = mapping[column];
      return at === undefined ? "" : (row[at] ?? "").trim();
    };

    const rowIssues: OutcomeIssue[] = [];
    const label = cell("label");

    const rawTheme = cell("theme");
    const rawThemeLabel = cell("themeLabel");
    // Le thème peut être un numéro, un libellé, ou les deux colonnes à la fois.
    const themeKey = (rawTheme || rawThemeLabel || "").trim();
    const themeLabel = (rawThemeLabel || rawTheme || "").trim();
    if (themeKey !== "" && !themeOrder.includes(themeKey)) {
      themeOrder.push(themeKey);
    }
    if (themeKey !== "" && themeLabel !== "") {
      // Un libellé plus parlant qu'un simple numéro l'emporte.
      const known = themeLabels.get(themeKey);
      if (!known || (/^\d+$/.test(known) && !/^\d+$/.test(themeLabel))) {
        themeLabels.set(themeKey, themeLabel);
      }
    }

    const themePosition = themeKey === "" ? 0 : themeOrder.indexOf(themeKey) + 1;
    const rawOrder = Number(cell("order"));
    const nextOrder = (orderWithinTheme.get(themeKey) ?? 0) + 1;
    orderWithinTheme.set(themeKey, nextOrder);
    const order = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.trunc(rawOrder) : nextOrder;

    let code = cell("code").toUpperCase();
    const codeGenerated = code === "";
    if (codeGenerated) code = generateCode(themePosition, order);

    const rawNature = cell("nature");
    const parsedNature = rawNature === "" ? undefined : parseNature(rawNature);
    if (rawNature !== "" && parsedNature === undefined) {
      rowIssues.push({
        line,
        column: "nature",
        level: "warning",
        message: `Nature « ${rawNature} » non reconnue : « ${defaultNature} » retenue.`,
      });
    }
    const nature = parsedNature ?? defaultNature;
    const natureAssumed = parsedNature === undefined;

    const rawLevel = cell("level");
    const parsedLevel = rawLevel === "" ? undefined : parseLevel(rawLevel);
    if (rawLevel !== "" && parsedLevel === undefined) {
      rowIssues.push({
        line,
        column: "level",
        level: "warning",
        message: `Niveau « ${rawLevel} » non reconnu : « ${defaultLevel} » retenu.`,
      });
    }
    const targetMastery = parsedLevel ?? defaultLevel;

    // Le rang R2C. Deux refus explicites plutot qu'une valeur avalee :
    //  - une valeur illisible n'est PAS ignoree en silence (« A/B », « rang 1 »
    //    dans une colonne mal choisie) : sur un referentiel de 313 lignes, une
    //    colonne perdue ne se voit pas a l'oeil ;
    //  - un rang sur une competence est une ERREUR de ligne, pas un
    //    avertissement : la base porte
    //    `check (knowledge_rank is null or nature = 'knowledge')` et refuserait
    //    l'insertion une par une. Autant le dire avant d'ecrire.
    const rawRank = cell("rank");
    const parsedRank = rawRank === "" ? undefined : parseKnowledgeRank(rawRank);
    if (rawRank !== "" && parsedRank === undefined) {
      rowIssues.push({
        line,
        column: "rank",
        level: "error",
        message: `Rang « ${rawRank} » non reconnu : attendu A, B ou C.`,
      });
    }
    if (parsedRank !== undefined && nature !== "knowledge") {
      rowIssues.push({
        line,
        column: "rank",
        level: "error",
        message: `Le rang ${parsedRank} ne s'applique qu'aux connaissances, et cette ligne est une compétence (${nature}).`,
      });
    }

    if (label === "") {
      rowIssues.push({ line, column: "label", level: "error", message: "Intitulé manquant." });
    }

    let status: OutcomeRowStatus = "ready";
    const changes: OutcomeChange[] = [];
    const known = byCode.get(code);
    if (rowIssues.some((i) => i.level === "error") || missingRequiredColumns.length > 0) {
      status = "invalid";
    } else if (seenCodes.has(code)) {
      status = "duplicate_in_file";
      rowIssues.push({
        line,
        column: "code",
        level: "warning",
        message: `Code ${code} déjà employé plus haut : la ligne sera ignorée.`,
      });
    } else if (known) {
      // Le code désigne un acquis ACTIF : la ligne le RÉVISE au lieu d'être
      // écartée. La nature, elle, ne se révise pas — des déclarations
      // d'étudiants et des validations s'y accrochent — donc un désaccord de
      // nature est une erreur de ligne, jamais une révision silencieuse.
      if (known.nature !== nature) {
        status = "invalid";
        rowIssues.push({
          line,
          column: "nature",
          level: "error",
          message: `Le code ${code} désigne un acquis de nature « ${known.nature} », et le fichier le donne pour « ${nature} ». La nature ne se change pas : archivez l'acquis et recréez-le sous un autre code.`,
        });
      } else {
        if (label !== known.label) {
          changes.push({ field: "label", before: known.label, after: label });
        }
        if (cell("description") !== known.description) {
          changes.push({
            field: "description",
            before: known.description,
            after: cell("description"),
          });
        }
        if (targetMastery !== known.targetMastery) {
          changes.push({ field: "level", before: known.targetMastery, after: targetMastery });
        }
        if ((parsedRank ?? "") !== (known.knowledgeRank ?? "")) {
          changes.push({
            field: "rank",
            before: known.knowledgeRank ?? "—",
            after: parsedRank ?? "—",
          });
        }
        status = changes.length > 0 ? "to_update" : "unchanged";
      }
    } else if (existing.has(code)) {
      status = "already_present";
      rowIssues.push({
        line,
        column: "code",
        level: "warning",
        message: `Code ${code} pris par un acquis ARCHIVÉ : il ne peut être ni créé ni révisé. Désarchivez-le, ou donnez-lui un autre code.`,
      });
    }
    if (code !== "") seenCodes.add(code);

    issues.push(...rowIssues);
    candidates.push({
      line,
      themeKey,
      themeLabel,
      code,
      codeGenerated,
      label,
      description: cell("description"),
      nature,
      natureAssumed,
      targetMastery,
      scope: cell("scope"),
      ...(parsedRank !== undefined ? { knowledgeRank: parsedRank } : {}),
      order,
      status,
      ...(known ? { outcomeId: known.id } : {}),
      changes,
      issues: rowIssues,
    });
  });

  const themes: OutcomeThemeDraft[] = themeOrder.map((key, index) => ({
    key,
    label: themeLabels.get(key) ?? key,
    position: index + 1,
    outcomes: candidates.filter((c) => c.themeKey === key),
  }));

  const readyCount = candidates.filter((c) => c.status === "ready").length;
  const toUpdateCount = candidates.filter((c) => c.status === "to_update").length;

  // Ce que le programme porte et que le fichier ne mentionne pas — restreint aux
  // natures présentes dans le fichier : un fichier de connaissances n'a pas à
  // signaler les 57 compétences comme « manquantes ». Purement informatif.
  const naturesInFile = new Set(candidates.map((c) => c.nature));
  const codesInFile = new Set(candidates.map((c) => c.code));
  const missingFromFile = (input.existingOutcomes ?? [])
    .filter((o) => naturesInFile.has(o.nature) && !codesInFile.has(o.code.trim().toUpperCase()))
    .map((o) => ({ code: o.code, label: o.label }));

  return {
    mapping,
    missingRequiredColumns,
    delimiter: parsed.delimiter,
    headerLine: parsed.headerLine,
    themes,
    candidates,
    readyCount,
    duplicateCount: candidates.filter((c) => c.status === "duplicate_in_file").length,
    alreadyPresentCount: candidates.filter((c) => c.status === "already_present").length,
    invalidCount: candidates.filter((c) => c.status === "invalid").length,
    generatedCodeCount: candidates.filter((c) => c.codeGenerated).length,
    natureAssumedCount: candidates.filter((c) => c.natureAssumed).length,
    rankedCount: candidates.filter((c) => c.knowledgeRank !== undefined).length,
    toUpdateCount,
    unchangedCount: candidates.filter((c) => c.status === "unchanged").length,
    missingFromFile,
    issues,
    // Rejouer un référentiel révisé dont AUCUNE ligne n'est nouvelle est un cas
    // normal : l'import doit rester possible s'il n'y a que des révisions.
    canImport: (readyCount > 0 || toUpdateCount > 0) && missingRequiredColumns.length === 0,
  };
}
