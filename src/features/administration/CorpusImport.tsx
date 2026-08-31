/**
 * Import d'un corpus : un document, ou une archive ZIP de documents.
 *
 * UN SEUL composant pour les trois entités qui s'importent — connaissances,
 * compétences, modalités d'évaluation — et pour les DEUX écrans qui y donnent
 * accès : le Concepteur de programme et l'onglet dédié. C'est la règle du
 * projet : une entité, un mécanisme d'import, un seul stockage, deux portes
 * d'entrée. Deux composants qui se ressembleraient finiraient par diverger,
 * et l'un des deux écrans produirait des lignes que l'autre ne saurait pas
 * relire.
 *
 * Ce que fait cet écran, et que l'import d'objectifs ne fait pas : il
 * CONSERVE les fichiers. Chaque document lisible est déposé dans la
 * médiathèque du programme, et ce que l'IA en tire est rattaché au document
 * dont il provient (`learning_resource_outcomes`) — sans quoi le référentiel
 * se remplit d'items dont plus personne ne sait d'où ils sortent.
 *
 * Gouvernance inchangée : l'IA propose, l'enseignant valide. Rien n'est créé
 * avant le clic final, et chaque proposition reste décochable et modifiable.
 *
 * Aucune brique serveur propre à cet écran : la chaîne réutilise telles
 * quelles `analyze-program-objectives`, `create_outcome`,
 * `create_assessment_modality`, `create_learning_resource` (qui pose les
 * liens dans le même appel) et le téléversement signé. Les mêmes
 * vérifications d'autorisation qu'un ajout manuel s'appliquent donc, sans
 * exception à écrire.
 */
import { useMemo, useState } from "react";
import { Check, FileUp, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataAccess } from "@/application/session";
import { OutcomeRosterImportPanel } from "@/features/administration/OutcomeRosterImportPanel";
import { requireCanonicalMediaType } from "@/infrastructure/storage/mediaTypes";
import type { ProgramAiAnalysisResult, ResourceVisibility } from "@/application/ports/repositories";
import {
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  SUBTYPES_BY_MODE,
  type AssessmentMode,
  type AssessmentSubtype,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  COMPETENCE_NATURE_LABELS_FR,
} from "@/domain/competenceDraft";
import {
  ANALYSIS_SLICE_CHARS,
  STORAGE_SEGMENT_CHARS,
  isLegacyDoc,
  readDocumentCorpus,
  splitText,
  type CorpusDocument,
} from "@/infrastructure/text/documentText";
import type {
  CurriculumVersionId,
  MasteryLevel,
  OutcomeId,
  OutcomeNature,
  ProgramId,
} from "@/domain/types";

/** Entité visée par l'import. Elle décide de ce qui est retenu dans la réponse
 * de l'analyse et de la fonction de création appelée à la fin. */
export type CorpusTarget = "knowledge" | "competences" | "assessments";

const TARGET_LABELS: Record<CorpusTarget, string> = {
  knowledge: "connaissance(s)",
  competences: "compétence(s)",
  assessments: "modalité(s) d'évaluation",
};

/** Dérivé de SUBTYPES_BY_MODE (source unique) plutôt que dupliqué : le mode
 * est mécanique une fois le sous-type connu. */
const MODE_BY_SUBTYPE: Record<AssessmentSubtype, AssessmentMode> = (() => {
  const map = {} as Record<AssessmentSubtype, AssessmentMode>;
  (Object.keys(SUBTYPES_BY_MODE) as AssessmentMode[]).forEach((mode) => {
    SUBTYPES_BY_MODE[mode].forEach((subtype) => {
      map[subtype] = mode;
    });
  });
  return map;
})();

const SELECT_CLASS = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

const OUTCOME_NATURE_LABELS_FR: Record<OutcomeNature, string> = {
  knowledge: "Connaissance",
  ...COMPETENCE_NATURE_LABELS_FR,
};

const VISIBILITY_LABELS_FR: Record<ResourceVisibility, string> = {
  staff_only: "Équipe pédagogique uniquement",
  cohort: "Classe(s) concernée(s)",
  program: "Tout le programme",
};

const ACCEPT =
  ".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,text/plain,.zip,application/zip,application/x-zip-compressed";

function slugifyDomain(domain: string): string {
  const cleaned = domain
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 14) || "REF";
}

/**
 * Codes lisibles groupés par domaine (DOMAINE-01, -02…).
 *
 * Les compteurs sont tenus pour TOUT le corpus, pas par document : deux
 * documents traitant du même domaine repartiraient sinon à -01 chacun, et la
 * contrainte `unique (program_id, code)` ferait échouer la seconde création
 * sans que rien ne l'ait laissé prévoir à l'écran. Les codes déjà présents
 * dans le programme sont sautés pour la même raison.
 */
function buildCorpusCodes(domains: readonly string[], alreadyUsed: ReadonlySet<string>): string[] {
  const counters = new Map<string, number>();
  const taken = new Set(alreadyUsed);
  return domains.map((domain) => {
    const prefix = slugifyDomain(domain);
    let code = "";
    do {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      code = `${prefix}-${String(next).padStart(2, "0")}`;
    } while (taken.has(code));
    taken.add(code);
    return code;
  });
}

/** Clé de comparaison de deux propositions : minuscules, sans accents ni
 * ponctuation. Un même concept revient d'une tranche à l'autre quand il est à
 * cheval sur la coupure ; sans dédoublonnage, le concepteur relirait deux fois
 * la même ligne. */
function comparisonKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let rowKeySeq = 0;
function nextKey(): string {
  rowKeySeq += 1;
  return `corpus-${rowKeySeq}`;
}

/** Une proposition d'acquis (connaissance ou compétence). */
interface OutcomeSuggestion {
  readonly kind: "outcome";
  readonly key: string;
  selected: boolean;
  code: string;
  label: string;
  domain: string;
  description: string;
  nature: OutcomeNature;
  targetMastery: MasteryLevel;
}

/** Une proposition de modalité d'évaluation. */
interface AssessmentSuggestion {
  readonly kind: "assessment";
  readonly key: string;
  selected: boolean;
  name: string;
  subtype: AssessmentSubtype;
  usage: AssessmentUsage;
  notes: string;
}

type SuggestionRow = OutcomeSuggestion | AssessmentSuggestion;

/** Seuil au-dessous duquel une page n'est pas proposée à l'analyse par défaut.
 * Un miroir de site contient surtout des pages d'index et de navigation ; les
 * envoyer toutes à l'IA coûterait un appel chacune pour un menu répété. */
const MIN_CHARS_FOR_ANALYSIS = 1500;

interface DocumentRow {
  readonly key: string;
  readonly document: CorpusDocument;
  /** Envoyer ce document à l'analyse IA — un appel, donc un coût, par document. */
  analyze: boolean;
  /** Déposer ce fichier dans la médiathèque du programme. */
  keepDocument: boolean;
  /** L'analyse a dû tronquer ce document : le texte dépassait la limite serveur. */
  truncated: boolean;
  status: "pending" | "analyzing" | "analyzed" | "failed";
  error: string | null;
  suggestions: readonly SuggestionRow[];
}

export function CorpusImport({
  target,
  programId,
  curriculumVersionId,
  existingOutcomeCodes = [],
  existingAssessmentNames = [],
  onCreated,
}: {
  readonly target: CorpusTarget;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId | undefined;
  readonly existingOutcomeCodes?: readonly string[];
  readonly existingAssessmentNames?: readonly string[];
  readonly onCreated?: () => void;
}) {
  const dataAccess = useDataAccess();
  const existingCodeSet = useMemo(
    () => new Set(existingOutcomeCodes.map((code) => code.trim().toUpperCase())),
    [existingOutcomeCodes],
  );
  const existingNameSet = useMemo(
    () => new Set(existingAssessmentNames.map((name) => name.trim().toLowerCase())),
    [existingAssessmentNames],
  );

  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [ignoredFiles, setIgnoredFiles] = useState<readonly string[]>([]);
  const [rows, setRows] = useState<readonly DocumentRow[]>([]);
  const [visibility, setVisibility] = useState<ResourceVisibility>("staff_only");
  /**
   * Déposer aussi les figures référencées par les documents.
   *
   * Décoché par défaut, et c'est délibéré : un site enregistré embarque des
   * centaines d'images dont la plupart sont de l'habillage (logos, icônes,
   * puces). Seules celles qu'une page référence vraiment sont candidates,
   * mais le tri fin reste à l'oeil du concepteur.
   *
   * Aucun appel IA n'est fait sur les images : elles sont conservées, pas
   * décrites. La description automatique reste à construire.
   */
  const [depositImages, setDepositImages] = useState(false);
  /**
   * Filtre sur le chemin des documents.
   *
   * Un site enregistré mêle les pages de contenu (« /page/chapitre-… ») aux
   * pages d'actualité, de compte et de mentions légales. Le filtre porte sur
   * ce qui distingue les unes des autres — le chemin — et non sur une
   * heuristique de contenu qui se tromperait sans le dire.
   *
   * Ce qui est masqué est EXCLU de tout : analyse, dépôt, création. La règle
   * est « ce que vous voyez est ce qui se passera » ; un document caché qui
   * serait quand même traité serait le pire des deux mondes.
   */
  const [pathFilter, setPathFilter] = useState("");

  /**
   * Les deux voies d'entrée d'un référentiel, sous le même bouton.
   *
   * « documents » part de fichiers et fait travailler l'IA ; « table » part
   * d'un référentiel déjà structuré et n'invente rien. Deux boutons séparés
   * donneraient deux chemins d'écriture vers la même liste unique d'acquis,
   * qui finiraient par diverger. Les modalités d'évaluation n'ont pas de
   * référentiel tabulé : l'onglet ne leur est pas proposé.
   */
  const rosterAvailable = target !== "assessments";
  const [mode, setMode] = useState<"documents" | "table">("documents");
  const showRoster = rosterAvailable && mode === "table";

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const needle = pathFilter.trim().toLowerCase();
  const visibleRows = needle
    ? rows.filter((row) => row.document.path.toLowerCase().includes(needle))
    : rows;
  const hiddenCount = rows.length - visibleRows.length;

  const analyzed = rows.some((row) => row.status === "analyzed");
  const selectedCount = visibleRows.reduce(
    (total, row) => total + row.suggestions.filter((s) => s.selected).length,
    0,
  );
  const documentsToDeposit = visibleRows.filter((row) => row.keepDocument).length;
  const documentsToAnalyze = visibleRows.filter((row) => row.analyze).length;
  /** Un appel par TRANCHE, pas par document : un chapitre de 110 000
   * caractères en demande sept. Annoncer le nombre de documents laisserait
   * croire à un coût sept fois moindre. */
  const analysisCalls = visibleRows
    .filter((row) => row.analyze)
    .reduce((total, row) => total + splitText(row.document.text, ANALYSIS_SLICE_CHARS).length, 0);
  const truncatedCount = visibleRows.filter((row) => row.truncated).length;
  const imagesAvailable = visibleRows.reduce((total, row) => total + row.document.images.length, 0);
  const imagesToDeposit = depositImages
    ? visibleRows.reduce(
        (total, row) => total + (row.keepDocument ? row.document.images.length : 0),
        0,
      )
    : 0;
  const busy = reading || analyzing || creating;

  const handleFile = async (file: File) => {
    setReadError(null);
    setSummary(null);
    setErrors([]);
    setIgnoredFiles([]);
    setRows([]);

    if (isLegacyDoc(file.name)) {
      setReadError(
        "Format .doc non pris en charge : enregistrez le fichier au format .docx puis réimportez-le.",
      );
      return;
    }

    setReading(true);
    try {
      const { documents, ignored } = await readDocumentCorpus(file);
      setIgnoredFiles(ignored);
      setRows(
        documents.map((document) => ({
          key: nextKey(),
          document,
          analyze: document.text.length >= MIN_CHARS_FOR_ANALYSIS,
          // Une page HTML issue d'un site enregistré est une SOURCE dont on
          // extrait des connaissances, pas un support à remettre aux
          // apprenants : elle n'est pas déposée par défaut.
          keepDocument: document.format !== "html",
          truncated: false,
          status: "pending" as const,
          error: null,
          suggestions: [],
        })),
      );
      if (documents.length === 0) {
        setReadError(
          "Aucun document lisible : l'import attend des PDF, des .docx, des .txt ou des .md, seuls ou dans une archive ZIP.",
        );
      }
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Échec de la lecture du fichier.");
    } finally {
      setReading(false);
    }
  };

  /**
   * Un appel d'analyse PAR DOCUMENT, en série.
   *
   * Par document, parce qu'une proposition doit savoir de quel fichier elle
   * vient — c'est toute la raison d'être de cet écran. En série, parce qu'un
   * corpus de trente fichiers lancé en parallèle se ferait limiter par
   * l'API et coûterait cher pour un résultat partiel ; ici, un échec isolé
   * n'emporte que son document.
   */
  const runAnalysis = async () => {
    setAnalyzing(true);
    setSummary(null);
    setErrors([]);
    // Seuls les documents cochés sont envoyés : un appel IA par document, donc
    // un coût par document. Le compteur ne parle que de ceux-là.
    const total = visibleRows.filter((row) => row.analyze).length;
    setAnalyzeProgress({ done: 0, total });
    let done = 0;

    const analyzedRows: DocumentRow[] = [];
    // Les codes sont attribués après coup, sur l'ensemble du corpus.
    const collected: { rowIndex: number; item: SuggestionRow }[] = [];

    const hidden = new Set(rows.filter((row) => !visibleRows.includes(row)).map((r) => r.key));

    for (const [index, row] of rows.entries()) {
      if (hidden.has(row.key) || !row.analyze) {
        analyzedRows.push(row);
        continue;
      }
      setRows((prev) =>
        prev.map((r) => (r.key === row.key ? { ...r, status: "analyzing", error: null } : r)),
      );
      try {
        // La totalité du texte est analysée, tranche par tranche. Le service
        // coupe au-delà de 20 000 caractères ; lui envoyer un chapitre entier
        // revenait à n'analyser que son début, sans que rien ne le dise.
        const slices = splitText(row.document.text, ANALYSIS_SLICE_CHARS);
        const result = {
          knowledgeItems: [] as ProgramAiAnalysisResult["knowledgeItems"][number][],
          assessmentModalities: [] as ProgramAiAnalysisResult["assessmentModalities"][number][],
          truncated: false,
        };
        for (const slice of slices) {
          const partial = await dataAccess.programs.analyzeObjectivesForReferential(
            programId,
            slice,
          );
          result.knowledgeItems.push(...partial.knowledgeItems);
          result.assessmentModalities.push(...partial.assessmentModalities);
          // Une tranche calibrée sous la limite ne devrait jamais être
          // tronquée ; si ça arrive, la limite du service a changé et il faut
          // le voir plutôt que de perdre du texte en silence.
          if (partial.truncated) result.truncated = true;
        }
        analyzedRows.push({
          ...row,
          status: "analyzed",
          error: null,
          truncated: result.truncated,
          suggestions: [],
        });
        // Dédoublonnage à l'échelle du document : un concept à cheval sur
        // deux tranches est proposé deux fois par le service.
        const seenInDocument = new Set<string>();
        if (target === "assessments") {
          result.assessmentModalities.forEach((item) => {
            if (seenInDocument.has(comparisonKey(item.name))) return;
            seenInDocument.add(comparisonKey(item.name));
            collected.push({
              rowIndex: index,
              item: {
                kind: "assessment",
                key: nextKey(),
                selected: !existingNameSet.has(item.name.trim().toLowerCase()),
                name: item.name,
                subtype: item.subtype,
                usage: item.usage,
                notes: item.notes,
              },
            });
          });
        } else {
          // L'analyse rend connaissances ET compétences dans la même liste :
          // on ne garde ici que la nature visée par cet écran, pour qu'un
          // import lancé depuis « Compétences » ne remplisse pas la base de
          // connaissances à l'insu du concepteur.
          result.knowledgeItems
            .filter((item) =>
              target === "knowledge" ? item.nature === "knowledge" : item.nature !== "knowledge",
            )
            .forEach((item) => {
              if (seenInDocument.has(comparisonKey(item.label))) return;
              seenInDocument.add(comparisonKey(item.label));
              collected.push({
                rowIndex: index,
                item: {
                  kind: "outcome",
                  key: nextKey(),
                  selected: true,
                  code: "",
                  label: item.label,
                  domain: item.domain,
                  description: item.description,
                  nature: item.nature,
                  targetMastery: item.targetMastery,
                },
              });
            });
        }
      } catch (err) {
        analyzedRows.push({
          ...row,
          status: "failed",
          error: err instanceof Error ? err.message : "Échec de l'analyse.",
          suggestions: [],
        });
      }
      done += 1;
      setAnalyzeProgress({ done, total });
    }

    const outcomeEntries = collected.filter(
      (entry): entry is { rowIndex: number; item: OutcomeSuggestion } =>
        entry.item.kind === "outcome",
    );
    // Les codes déjà pris sont relus EN BASE, pas déduits de la liste
    // affichée : celle-ci masque les acquis archivés, dont le code reste
    // pourtant réservé par la contrainte d'unicité.
    let takenCodes = existingCodeSet;
    try {
      const taken = await dataAccess.outcomes.listTakenOutcomeCodes(programId);
      takenCodes = new Set(taken.map((code) => code.trim().toUpperCase()));
    } catch {
      // La génération retombe sur la liste affichée ; une collision reste
      // possible et sera signalée à la création.
    }

    const codes = buildCorpusCodes(
      outcomeEntries.map((entry) => entry.item.domain),
      takenCodes,
    );
    outcomeEntries.forEach((entry, position) => {
      entry.item.code = codes[position] ?? `REF-${String(position + 1).padStart(2, "0")}`;
    });

    setRows(
      analyzedRows.map((row, index) => ({
        ...row,
        suggestions: collected.filter((entry) => entry.rowIndex === index).map((e) => e.item),
      })),
    );
    setAnalyzeProgress(null);
    setAnalyzing(false);
  };

  /**
   * Modification d'un champ d'une proposition.
   *
   * Le type de la retouche est celui de la variante concernée : TypeScript ne
   * sait pas, sur une union, qu'un `Partial` s'applique à la même branche que
   * la ligne modifiée. L'assertion est donc restreinte au strict nécessaire,
   * et l'appelant reste typé — c'est `next` qui est vérifié à l'appel.
   */
  const patchSuggestion = (
    rowKey: string,
    key: string,
    next: Partial<OutcomeSuggestion> | Partial<AssessmentSuggestion>,
  ) =>
    setRows((prev) =>
      prev.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              suggestions: row.suggestions.map((s) =>
                s.key === key ? ({ ...s, ...next } as SuggestionRow) : s,
              ),
            }
          : row,
      ),
    );

  const patchRow = (rowKey: string, next: Partial<DocumentRow>) =>
    setRows((prev) => prev.map((row) => (row.key === rowKey ? { ...row, ...next } : row)));

  /**
   * Création réelle, document par document, dans cet ordre : les
   * connaissances d'abord, puis le support qui les référence.
   *
   * L'ordre n'est pas indifférent — `create_learning_resource` reçoit les
   * identifiants des acquis et pose les liens dans le même appel. Un support
   * créé avant ses connaissances resterait orphelin, et il faudrait un
   * second aller-retour pour le rattacher.
   */
  const createSelected = async () => {
    if (!curriculumVersionId) {
      setErrors(["Aucune version de curriculum réelle pour ce programme : impossible de créer."]);
      return;
    }
    setCreating(true);
    setSummary(null);
    const failures: string[] = [];
    let createdItems = 0;
    let createdResources = 0;
    let createdImages = 0;
    let storedSegments = 0;

    // Détection locale des collisions de code AVANT tout appel réseau : la
    // contrainte SQL les rejetterait une par une, avec un message Postgres
    // brut et une création à moitié faite.
    // Relu maintenant, et pas au chargement de l'écran : entre l'analyse et
    // ce clic, des acquis ont pu être créés ailleurs — ou l'analyse précédente
    // a pu en créer une partie avant d'échouer.
    let seenCodes = new Set(existingCodeSet);
    try {
      const taken = await dataAccess.outcomes.listTakenOutcomeCodes(programId);
      seenCodes = new Set(taken.map((code) => code.trim().toUpperCase()));
    } catch {
      // On garde la liste affichée : la contrainte SQL reste le dernier
      // rempart, et l'échec sera signalé ligne par ligne.
    }
    const seenNames = new Set(existingNameSet);

    for (const row of visibleRows) {
      const chosen = row.suggestions.filter((s) => s.selected);
      if (chosen.length === 0 && !row.keepDocument) continue;

      const outcomeIds: OutcomeId[] = [];
      for (const suggestion of chosen) {
        if (suggestion.kind === "assessment") {
          const name = suggestion.name.trim();
          if (!name) {
            failures.push("Une modalité d'évaluation sans nom a été ignorée.");
            continue;
          }
          if (seenNames.has(name.toLowerCase())) {
            failures.push(
              `« ${name} » : une modalité porte déjà ce nom dans ce programme — renommez-la ou décochez cette ligne.`,
            );
            continue;
          }
          try {
            await dataAccess.assessments.createAssessmentModality({
              programId,
              name,
              // Le mode est dérivé du sous-type, jamais saisi : la contrainte
              // SQL `assessment_modalities_subtype_matches_mode` refuserait
              // une association incohérente.
              mode: MODE_BY_SUBTYPE[suggestion.subtype],
              subtype: suggestion.subtype,
              usage: suggestion.usage,
              notes: suggestion.notes.trim(),
            });
            seenNames.add(name.toLowerCase());
            createdItems += 1;
          } catch (err) {
            failures.push(
              `« ${name} » : ${err instanceof Error ? err.message : "échec de création"}`,
            );
          }
          continue;
        }

        const code = suggestion.code.trim().toUpperCase();
        if (!code) {
          failures.push(`« ${suggestion.label} » : code vide.`);
          continue;
        }
        if (seenCodes.has(code)) {
          failures.push(
            `« ${suggestion.label} » : le code « ${code} » est déjà pris dans ce programme, peut-être par un acquis archivé qui n'apparaît plus dans les listes — modifiez le code ou décochez cette ligne.`,
          );
          continue;
        }
        try {
          const created = await dataAccess.outcomes.createOutcome({
            programId,
            curriculumVersionId,
            code,
            label: suggestion.label.trim(),
            description: suggestion.description.trim(),
            nature: suggestion.nature,
            domain: suggestion.domain.trim(),
            targetMastery: suggestion.targetMastery,
          });
          seenCodes.add(code);
          outcomeIds.push(created.id);
          createdItems += 1;
        } catch (err) {
          failures.push(
            `« ${suggestion.label} » : ${err instanceof Error ? err.message : "échec de création"}`,
          );
        }
      }

      if (!row.keepDocument) continue;

      try {
        const baseName = (row.document.path.split("/").pop() ?? row.document.path).replace(
          /\.[^.]+$/,
          "",
        );
        const resource = await dataAccess.resources.createResource({
          programId,
          curriculumVersionId,
          title: baseName,
          description: `Importé depuis ${row.document.path}.`,
          format: row.document.format === "pdf" ? "pdf" : "other",
          visibility,
          outcomeIds,
        });
        const upload = await dataAccess.resources.requestUploadUrl({
          programId,
          bucket: "course-sources",
          fileName: row.document.file.name,
        });
        await dataAccess.resources.uploadResourceFile(upload, row.document.file);
        await dataAccess.resources.registerAsset({
          resourceId: resource.id,
          kind: "source",
          bucketName: upload.bucket,
          objectPath: upload.objectPath,
          // Type déduit de l'extension, jamais de `File.type` : un fichier
          // sorti d'une archive n'a pas de type MIME, et le bucket refuserait
          // `application/octet-stream`.
          mediaType: requireCanonicalMediaType(row.document.file.name),
          originalFileName: row.document.file.name,
          byteSize: row.document.file.size,
        });
        createdResources += 1;

        // Le TEXTE INTÉGRAL, découpé en segments, est conservé en base. Sans
        // lui, exploiter un cours plus tard supposerait de retélécharger le
        // binaire et de refaire l'extraction à chaque usage. Un échec ici ne
        // remet pas en cause le dépôt du document : on le signale et on
        // continue.
        try {
          const segments = splitText(row.document.text, STORAGE_SEGMENT_CHARS);
          const stored = await dataAccess.resources.storeResourceText(
            resource.id,
            row.document.path,
            segments,
          );
          storedSegments += stored;
        } catch (err) {
          failures.push(
            `Texte de « ${row.document.path} » : ${err instanceof Error ? err.message : "échec de l'enregistrement"}`,
          );
        }

        // Les figures sont déposées comme assets du MÊME support : elles
        // restent auprès du document dont elles proviennent. L'échec d'une
        // image n'annule pas le dépôt du document — on le signale et on
        // continue, sinon une seule figure illisible ferait perdre le
        // chapitre entier.
        if (depositImages) {
          for (const image of row.document.images) {
            try {
              const imageUpload = await dataAccess.resources.requestUploadUrl({
                programId,
                bucket: "course-sources",
                fileName: image.file.name,
              });
              await dataAccess.resources.uploadResourceFile(imageUpload, image.file);
              await dataAccess.resources.registerAsset({
                resourceId: resource.id,
                kind: "illustration",
                bucketName: imageUpload.bucket,
                objectPath: imageUpload.objectPath,
                mediaType: requireCanonicalMediaType(image.file.name),
                originalFileName: image.file.name,
                byteSize: image.file.size,
              });
              createdImages += 1;
            } catch (err) {
              failures.push(
                `Figure « ${image.path} » : ${err instanceof Error ? err.message : "échec du dépôt"}`,
              );
            }
          }
        }
      } catch (err) {
        failures.push(
          `Dépôt de « ${row.document.path} » : ${err instanceof Error ? err.message : "échec"}`,
        );
      }
    }

    if (createdItems > 0 || createdResources > 0 || storedSegments > 0) {
      setSummary(
        `${createdItems} ${TARGET_LABELS[target]} créée(s), ${createdResources} document(s) et ${createdImages} figure(s) déposés, ${storedSegments} segment(s) de texte conservés${
          failures.length > 0 ? " — voir les échecs ci-dessous" : "."
        }`,
      );
      setRows([]);
      onCreated?.();
    }
    setErrors(failures);
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      {rosterAvailable ? (
        <div className="border-border flex flex-wrap gap-1 border-b pb-1">
          {(
            [
              ["documents", "Documents et archives (analyse IA)"],
              ["table", "Tableau déjà structuré (sans IA)"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              className="min-h-9"
              disabled={busy}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      {showRoster ? (
        <OutcomeRosterImportPanel
          programId={programId}
          curriculumVersionId={curriculumVersionId}
          defaultNature={target === "knowledge" ? "knowledge" : "real_competence"}
          existingOutcomeCodes={existingOutcomeCodes}
          {...(onCreated ? { onCreated } : {})}
        />
      ) : (
        <>
          <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
            <Button asChild variant="outline" size="sm" className="min-h-9" disabled={busy}>
              <label>
                {reading ? (
                  <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                ) : (
                  <FileUp className="me-1 size-4" aria-hidden />
                )}
                Importer un corpus de {TARGET_LABELS[target]} (document ou archive ZIP)
                <input
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleFile(file);
                  }}
                />
              </label>
            </Button>
            <span className="text-muted-foreground text-xs">
              Les fichiers sont déposés dans la médiathèque du programme, et les propositions
              extraites restent rattachées au document dont elles viennent.
            </span>
          </div>

          {readError ? <p className="text-destructive text-sm">{readError}</p> : null}

          {ignoredFiles.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {ignoredFiles.length} fichier(s) écartés (format non lisible ou sans texte) :{" "}
              {ignoredFiles.slice(0, 5).join(", ")}
              {ignoredFiles.length > 5 ? "…" : ""}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {rows.length} document(s) lus
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  disabled={busy || analyzed || documentsToAnalyze === 0}
                  onClick={() => void runAnalysis()}
                >
                  {analyzing ? (
                    <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="me-1 size-4" aria-hidden />
                  )}
                  {analyzing && analyzeProgress
                    ? `Analyse ${analyzeProgress.done}/${analyzeProgress.total}…`
                    : `Analyser ${documentsToAnalyze} document(s) — ${analysisCalls} appel(s) IA`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={busy || analyzed}
                  onClick={() =>
                    setRows((prev) => {
                      const shown = prev.filter((row) => visibleRows.includes(row));
                      const allOn = shown.every((row) => row.analyze);
                      return prev.map((row) =>
                        visibleRows.includes(row) ? { ...row, analyze: !allOn } : row,
                      );
                    })
                  }
                >
                  Tout cocher / décocher (analyse)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() =>
                    setRows((prev) => {
                      const shown = prev.filter((row) => visibleRows.includes(row));
                      const allOn = shown.every((row) => row.keepDocument);
                      return prev.map((row) =>
                        visibleRows.includes(row) ? { ...row, keepDocument: !allOn } : row,
                      );
                    })
                  }
                >
                  Tout cocher / décocher (dépôt)
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                La totalité du texte est analysée, par tranches de{" "}
                {ANALYSIS_SLICE_CHARS.toLocaleString("fr-FR")} caractères — un appel, donc un coût,
                par tranche. Les documents de moins de{" "}
                {MIN_CHARS_FOR_ANALYSIS.toLocaleString("fr-FR")} caractères sont décochés d'office :
                dans un site enregistré, ce sont presque toujours des pages d'index ou de
                navigation.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="corpus-path-filter">Ne garder que les chemins contenant</Label>
                <Input
                  id="corpus-path-filter"
                  value={pathFilter}
                  disabled={busy}
                  placeholder="chapitre"
                  onChange={(event) => setPathFilter(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {hiddenCount > 0
                    ? `${hiddenCount} document(s) masqués — ils ne seront ni analysés, ni déposés, ni créés.`
                    : "Laissez vide pour tout garder. Sur un site enregistré, « chapitre » suffit le plus souvent à écarter actualités, mentions légales et pages de compte."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="corpus-visibility">Visibilité des documents déposés</Label>
                <select
                  id="corpus-visibility"
                  className={SELECT_CLASS}
                  value={visibility}
                  disabled={busy}
                  onChange={(event) => setVisibility(event.target.value as ResourceVisibility)}
                >
                  {(Object.keys(VISIBILITY_LABELS_FR) as ResourceVisibility[]).map((value) => (
                    <option key={value} value={value}>
                      {VISIBILITY_LABELS_FR[value]}
                    </option>
                  ))}
                </select>
              </div>

              {imagesAvailable > 0 ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={depositImages}
                    disabled={busy}
                    onCheckedChange={(checked) => setDepositImages(checked === true)}
                  />
                  <span>
                    Déposer aussi les {imagesAvailable} figure(s) référencées par ces documents
                    <span className="text-muted-foreground block text-xs">
                      Les figures sont conservées auprès de leur document, jamais analysées : aucun
                      appel IA, aucun coût. Leur description automatique reste à construire.
                    </span>
                  </span>
                </label>
              ) : null}

              <ul className="space-y-3">
                {visibleRows.map((row) => (
                  <li key={row.key} className="border-border space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.document.path}</span>
                      <Badge variant="outline" className="font-normal">
                        {row.document.text.length.toLocaleString("fr-FR")} caractères
                      </Badge>
                      {row.status === "analyzing" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      {row.document.images.length > 0 ? (
                        <Badge variant="outline" className="font-normal">
                          {row.document.images.length} figure(s)
                        </Badge>
                      ) : null}
                      {row.truncated ? (
                        <Badge variant="outline" className="text-destructive font-normal">
                          texte tronqué à l'analyse
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={row.analyze}
                          disabled={busy || analyzed}
                          onCheckedChange={(checked) =>
                            patchRow(row.key, { analyze: checked === true })
                          }
                        />
                        Analyser ce document
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={row.keepDocument}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            patchRow(row.key, { keepDocument: checked === true })
                          }
                        />
                        Déposer ce document et conserver son texte
                      </label>
                    </div>

                    {row.error ? <p className="text-destructive text-xs">{row.error}</p> : null}

                    {row.suggestions.length > 0 ? (
                      <ul className="space-y-2">
                        {row.suggestions.map((suggestion) =>
                          suggestion.kind === "assessment" ? (
                            <li
                              key={suggestion.key}
                              className="grid gap-2 sm:grid-cols-[auto_1fr_10rem_10rem]"
                            >
                              <Checkbox
                                checked={suggestion.selected}
                                disabled={busy}
                                aria-label={`Retenir ${suggestion.name}`}
                                onCheckedChange={(checked) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    selected: checked === true,
                                  })
                                }
                              />
                              <Input
                                value={suggestion.name}
                                disabled={busy}
                                aria-label="Nom de la modalité"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    name: event.target.value,
                                  })
                                }
                              />
                              <select
                                className={SELECT_CLASS}
                                value={suggestion.subtype}
                                disabled={busy}
                                aria-label="Sous-type"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    subtype: event.target.value as AssessmentSubtype,
                                  })
                                }
                              >
                                {(
                                  Object.keys(ASSESSMENT_SUBTYPE_LABELS_FR) as AssessmentSubtype[]
                                ).map((value) => (
                                  <option key={value} value={value}>
                                    {ASSESSMENT_SUBTYPE_LABELS_FR[value]}
                                  </option>
                                ))}
                              </select>
                              <select
                                className={SELECT_CLASS}
                                value={suggestion.usage}
                                disabled={busy}
                                aria-label="Usage"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    usage: event.target.value as AssessmentUsage,
                                  })
                                }
                              >
                                {(Object.keys(ASSESSMENT_USAGE_LABELS_FR) as AssessmentUsage[]).map(
                                  (value) => (
                                    <option key={value} value={value}>
                                      {ASSESSMENT_USAGE_LABELS_FR[value]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </li>
                          ) : (
                            <li
                              key={suggestion.key}
                              className="grid gap-2 sm:grid-cols-[auto_12rem_1fr_10rem]"
                            >
                              <Checkbox
                                checked={suggestion.selected}
                                disabled={busy}
                                aria-label={`Retenir ${suggestion.label}`}
                                onCheckedChange={(checked) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    selected: checked === true,
                                  })
                                }
                              />
                              <Input
                                value={suggestion.code}
                                disabled={busy}
                                aria-label="Code"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    code: event.target.value,
                                  })
                                }
                              />
                              <Input
                                value={suggestion.label}
                                disabled={busy}
                                aria-label="Intitulé"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    label: event.target.value,
                                  })
                                }
                              />
                              <select
                                className={SELECT_CLASS}
                                value={suggestion.nature}
                                disabled={busy}
                                aria-label="Nature"
                                onChange={(event) =>
                                  patchSuggestion(row.key, suggestion.key, {
                                    nature: event.target.value as OutcomeNature,
                                  })
                                }
                              >
                                {(Object.keys(OUTCOME_NATURE_LABELS_FR) as OutcomeNature[]).map(
                                  (n) => (
                                    <option key={n} value={n}>
                                      {OUTCOME_NATURE_LABELS_FR[n]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : row.status === "analyzed" ? (
                      <p className="text-muted-foreground text-xs">
                        Aucune proposition pour ce document.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy || (selectedCount === 0 && documentsToDeposit === 0)}
                  onClick={() => void createSelected()}
                >
                  {creating ? (
                    <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="me-1 size-4" aria-hidden />
                  )}
                  Créer {selectedCount} {TARGET_LABELS[target]} et déposer {documentsToDeposit}{" "}
                  document(s)
                  {imagesToDeposit > 0 ? ` et ${imagesToDeposit} figure(s)` : ""}
                </Button>
                <span className="text-muted-foreground text-xs">
                  Rien n'est écrit avant ce clic.{" "}
                  {target === "assessments"
                    ? "Le mode (présentiel ou en ligne) est déduit du sous-type."
                    : `Le niveau cible par défaut est « ${COMPETENCE_MASTERY_LABELS_FR.proficient} » et reste modifiable ensuite dans l'onglet dédié.`}
                </span>
              </div>
            </>
          ) : null}

          {truncatedCount > 0 ? (
            <p className="text-destructive text-xs">
              {truncatedCount} document(s) ont été coupés par le service d'analyse alors que les
              tranches sont calibrées pour tenir sous sa limite. Cela signifie que cette limite a
              changé côté serveur : signalez-le, du texte est perdu.
            </p>
          ) : null}

          {summary ? <p className="text-sm">{summary}</p> : null}
          {errors.length > 0 ? (
            <ul className="text-destructive space-y-1 text-xs">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
