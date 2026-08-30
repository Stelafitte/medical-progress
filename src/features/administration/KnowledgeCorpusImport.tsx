/**
 * Import d'un corpus de base de connaissances : un document, ou une archive
 * ZIP de documents.
 *
 * Ce que fait cet écran, et que l'import d'objectifs ne fait pas : il
 * CONSERVE les fichiers. Chaque document lisible est déposé dans la
 * médiathèque du programme, et les connaissances que l'IA en tire sont
 * rattachées au document dont elles proviennent. C'est ce lien
 * (`learning_resource_outcomes`) qui permet, plus tard, de remonter d'une
 * connaissance à sa source — sans lui, le référentiel se remplit d'items
 * dont plus personne ne sait d'où ils sortent.
 *
 * Gouvernance inchangée : l'IA propose, l'enseignant valide. Rien n'est créé
 * avant le clic final, et chaque proposition reste décochable et modifiable.
 *
 * Aucune nouvelle brique serveur : la chaîne réutilise telles quelles
 * `analyze-program-objectives`, `create_outcome`, `create_learning_resource`
 * (qui pose les liens dans le même appel) et la chaîne de téléversement
 * signé. Les mêmes vérifications d'autorisation qu'un ajout manuel
 * s'appliquent donc, sans exception à écrire.
 */
import { useMemo, useState } from "react";
import { Check, FileUp, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataAccess } from "@/application/session";
import type { ResourceVisibility } from "@/application/ports/repositories";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  COMPETENCE_NATURE_LABELS_FR,
} from "@/domain/competenceDraft";
import {
  isLegacyDoc,
  readDocumentCorpus,
  type CorpusDocument,
} from "@/infrastructure/text/documentText";
import type {
  CurriculumVersionId,
  MasteryLevel,
  OutcomeId,
  OutcomeNature,
  ProgramId,
} from "@/domain/types";

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

let rowKeySeq = 0;
function nextKey(): string {
  rowKeySeq += 1;
  return `corpus-${rowKeySeq}`;
}

interface SuggestionRow {
  readonly key: string;
  selected: boolean;
  code: string;
  label: string;
  domain: string;
  description: string;
  nature: OutcomeNature;
  targetMastery: MasteryLevel;
}

interface DocumentRow {
  readonly key: string;
  readonly document: CorpusDocument;
  /** Déposer ce fichier dans la médiathèque du programme. */
  keepDocument: boolean;
  status: "pending" | "analyzing" | "analyzed" | "failed";
  error: string | null;
  suggestions: readonly SuggestionRow[];
}

export function KnowledgeCorpusImport({
  programId,
  curriculumVersionId,
  existingOutcomeCodes = [],
  onCreated,
}: {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId | undefined;
  readonly existingOutcomeCodes?: readonly string[];
  readonly onCreated?: () => void;
}) {
  const dataAccess = useDataAccess();
  const existingCodeSet = useMemo(
    () => new Set(existingOutcomeCodes.map((code) => code.trim().toUpperCase())),
    [existingOutcomeCodes],
  );

  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [ignoredFiles, setIgnoredFiles] = useState<readonly string[]>([]);
  const [rows, setRows] = useState<readonly DocumentRow[]>([]);
  const [visibility, setVisibility] = useState<ResourceVisibility>("staff_only");

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const analyzed = rows.some((row) => row.status === "analyzed");
  const selectedCount = rows.reduce(
    (total, row) => total + row.suggestions.filter((s) => s.selected).length,
    0,
  );
  const documentsToDeposit = rows.filter((row) => row.keepDocument).length;
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
          keepDocument: true,
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
    const total = rows.length;
    setAnalyzeProgress({ done: 0, total });

    const analyzedRows: DocumentRow[] = [];
    // Les codes sont attribués après coup, sur l'ensemble du corpus.
    const collected: { rowIndex: number; item: SuggestionRow }[] = [];

    for (const [index, row] of rows.entries()) {
      setRows((prev) =>
        prev.map((r) => (r.key === row.key ? { ...r, status: "analyzing", error: null } : r)),
      );
      try {
        const result = await dataAccess.programs.analyzeObjectivesForReferential(
          programId,
          row.document.text,
        );
        analyzedRows.push({ ...row, status: "analyzed", error: null, suggestions: [] });
        result.knowledgeItems.forEach((item) => {
          collected.push({
            rowIndex: index,
            item: {
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
      } catch (err) {
        analyzedRows.push({
          ...row,
          status: "failed",
          error: err instanceof Error ? err.message : "Échec de l'analyse.",
          suggestions: [],
        });
      }
      setAnalyzeProgress({ done: index + 1, total });
    }

    const codes = buildCorpusCodes(
      collected.map((entry) => entry.item.domain),
      existingCodeSet,
    );
    collected.forEach((entry, position) => {
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

  const patchSuggestion = (rowKey: string, key: string, next: Partial<SuggestionRow>) =>
    setRows((prev) =>
      prev.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              suggestions: row.suggestions.map((s) => (s.key === key ? { ...s, ...next } : s)),
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
    let createdOutcomes = 0;
    let createdResources = 0;

    // Détection locale des collisions de code AVANT tout appel réseau : la
    // contrainte SQL les rejetterait une par une, avec un message Postgres
    // brut et une création à moitié faite.
    const seenCodes = new Set(existingCodeSet);

    for (const row of rows) {
      const chosen = row.suggestions.filter((s) => s.selected);
      if (chosen.length === 0 && !row.keepDocument) continue;

      const outcomeIds: OutcomeId[] = [];
      for (const suggestion of chosen) {
        const code = suggestion.code.trim().toUpperCase();
        if (!code) {
          failures.push(`« ${suggestion.label} » : code vide.`);
          continue;
        }
        if (seenCodes.has(code)) {
          failures.push(
            `« ${suggestion.label} » : le code « ${code} » est déjà utilisé dans ce programme — modifiez-le ou décochez cette ligne.`,
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
          createdOutcomes += 1;
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
          mediaType: row.document.file.type || "application/octet-stream",
          originalFileName: row.document.file.name,
          byteSize: row.document.file.size,
        });
        createdResources += 1;
      } catch (err) {
        failures.push(
          `Dépôt de « ${row.document.path} » : ${err instanceof Error ? err.message : "échec"}`,
        );
      }
    }

    if (createdOutcomes > 0 || createdResources > 0) {
      setSummary(
        `${createdOutcomes} connaissance(s) créée(s) et ${createdResources} document(s) déposé(s) dans la médiathèque${
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
      <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
        <Button asChild variant="outline" size="sm" className="min-h-9" disabled={busy}>
          <label>
            {reading ? (
              <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="me-1 size-4" aria-hidden />
            )}
            Importer un corpus (document ou archive ZIP)
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
          Les fichiers sont déposés dans la médiathèque du programme, et les connaissances extraites
          restent rattachées au document dont elles viennent.
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
              disabled={busy || analyzed}
              onClick={() => void runAnalysis()}
            >
              {analyzing ? (
                <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="me-1 size-4" aria-hidden />
              )}
              {analyzing && analyzeProgress
                ? `Analyse ${analyzeProgress.done}/${analyzeProgress.total}…`
                : "Analyser le corpus avec l'IA"}
            </Button>
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

          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.key} className="border-border space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{row.document.path}</span>
                  <Badge variant="outline" className="font-normal">
                    {row.document.text.length.toLocaleString("fr-FR")} caractères
                  </Badge>
                  {row.status === "analyzing" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={row.keepDocument}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      patchRow(row.key, { keepDocument: checked === true })
                    }
                  />
                  Déposer ce document dans la médiathèque
                </label>

                {row.error ? <p className="text-destructive text-xs">{row.error}</p> : null}

                {row.suggestions.length > 0 ? (
                  <ul className="space-y-2">
                    {row.suggestions.map((suggestion) => (
                      <li
                        key={suggestion.key}
                        className="grid gap-2 sm:grid-cols-[auto_9rem_1fr_10rem]"
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
                            patchSuggestion(row.key, suggestion.key, { code: event.target.value })
                          }
                        />
                        <Input
                          value={suggestion.label}
                          disabled={busy}
                          aria-label="Intitulé"
                          onChange={(event) =>
                            patchSuggestion(row.key, suggestion.key, { label: event.target.value })
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
                          {(Object.keys(OUTCOME_NATURE_LABELS_FR) as OutcomeNature[]).map((n) => (
                            <option key={n} value={n}>
                              {OUTCOME_NATURE_LABELS_FR[n]}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : row.status === "analyzed" ? (
                  <p className="text-muted-foreground text-xs">
                    Aucune connaissance proposée pour ce document.
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
              Créer {selectedCount} connaissance(s) et déposer {documentsToDeposit} document(s)
            </Button>
            <span className="text-muted-foreground text-xs">
              Rien n'est écrit avant ce clic. Le niveau cible par défaut est «{" "}
              {COMPETENCE_MASTERY_LABELS_FR.proficient} » et reste modifiable ensuite dans l'onglet
              dédié.
            </span>
          </div>
        </>
      ) : null}

      {summary ? <p className="text-sm">{summary}</p> : null}
      {errors.length > 0 ? (
        <ul className="text-destructive space-y-1 text-xs">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
