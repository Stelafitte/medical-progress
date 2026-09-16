/**
 * Analyse IA du texte d'objectifs pédagogiques (import PDF/Word/texte du
 * Concepteur de programme) : propose un référentiel candidat — connaissances
 * & compétences (Outcome) et modalités d'évaluation — sous forme de matrice
 * éditable. RIEN n'est créé tant que le concepteur n'a pas explicitement
 * validé (cases à cocher pré-cochées, mais tout reste modifiable ou
 * décochable). Même principe de gouvernance que celui énoncé dans les
 * programmes eux-mêmes : l'IA propose, l'enseignant valide.
 */
import { useMemo, useState } from "react";
import { Loader2, Sparkles, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  MODE_PRESUME_DU_FORMAT,
  type AssessmentSubtype,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  COMPETENCE_NATURE_LABELS_FR,
} from "@/domain/competenceDraft";
import type { CurriculumVersionId, MasteryLevel, OutcomeNature, ProgramId } from "@/domain/types";

const SELECT_CLASS = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

const OUTCOME_NATURE_LABELS_FR: Record<OutcomeNature, string> = {
  knowledge: "Connaissance",
  ...COMPETENCE_NATURE_LABELS_FR,
};


function slugifyDomain(domain: string): string {
  const cleaned = domain
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 14) || "REF";
}

/** Codes lisibles, groupés par domaine (REF-DOMAINE-01, -02…), sans collision. */
function buildOutcomeCodes(items: readonly { domain: string }[]): string[] {
  const counters = new Map<string, number>();
  return items.map((item) => {
    const prefix = slugifyDomain(item.domain);
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(2, "0")}`;
  });
}

let rowKeySeq = 0;
function nextKey(): string {
  rowKeySeq += 1;
  return `ai-row-${rowKeySeq}`;
}

interface OutcomeRow {
  readonly key: string;
  selected: boolean;
  code: string;
  label: string;
  domain: string;
  description: string;
  nature: OutcomeNature;
  targetMastery: MasteryLevel;
  readonly sourceExcerpt: string;
  /** Code déjà présent dans ce programme au moment de l'analyse : décoché par défaut. */
  readonly duplicateOnLoad: boolean;
}

interface AssessmentRow {
  readonly key: string;
  selected: boolean;
  name: string;
  subtype: AssessmentSubtype;
  usage: AssessmentUsage;
  notes: string;
  /** Nom déjà présent dans ce programme au moment de l'analyse : décoché par défaut. */
  readonly duplicateOnLoad: boolean;
}

export function ProgramAiReferentialAnalysis({
  programId,
  curriculumVersionId,
  objectives,
  existingOutcomeCodes = [],
  existingAssessmentNames = [],
  onCreated,
}: {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId | undefined;
  readonly objectives: string;
  /** Codes de connaissances/compétences déjà associées à ce programme (détection de doublon). */
  readonly existingOutcomeCodes?: readonly string[];
  /** Noms de modalités d'évaluation déjà associées à ce programme (détection de doublon). */
  readonly existingAssessmentNames?: readonly string[];
  /** Appelé après une création (même partielle) pour rafraîchir les écrans dépendants. */
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
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);
  const [outcomeRows, setOutcomeRows] = useState<readonly OutcomeRow[] | null>(null);
  const [assessmentRows, setAssessmentRows] = useState<readonly AssessmentRow[] | null>(null);

  const [creating, setCreating] = useState(false);
  const [createSummary, setCreateSummary] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<readonly string[]>([]);

  const hasResult = outcomeRows !== null || assessmentRows !== null;

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setCreateSummary(null);
    setCreateErrors([]);
    try {
      const result = await dataAccess.programs.analyzeObjectivesForReferential(
        programId,
        objectives,
      );
      const codes = buildOutcomeCodes(result.knowledgeItems);
      setOutcomeRows(
        result.knowledgeItems.map((item, index) => {
          const code = codes[index] ?? `REF-${String(index + 1).padStart(2, "0")}`;
          const duplicateOnLoad = existingCodeSet.has(code.toUpperCase());
          return {
            key: nextKey(),
            selected: !duplicateOnLoad,
            code,
            label: item.label,
            domain: item.domain,
            description: item.description,
            nature: item.nature,
            targetMastery: item.targetMastery,
            sourceExcerpt: item.sourceExcerpt,
            duplicateOnLoad,
          };
        }),
      );
      setAssessmentRows(
        result.assessmentModalities.map((item) => {
          const duplicateOnLoad = existingNameSet.has(item.name.trim().toLowerCase());
          return {
            key: nextKey(),
            selected: !duplicateOnLoad,
            name: item.name,
            subtype: item.subtype,
            usage: item.usage,
            notes: item.notes,
            duplicateOnLoad,
          };
        }),
      );
      setTruncatedNotice(result.truncated);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Échec de l'analyse IA.");
    } finally {
      setAnalyzing(false);
    }
  };

  const patchOutcome = (key: string, next: Partial<OutcomeRow>) =>
    setOutcomeRows(
      (prev) => prev?.map((row) => (row.key === key ? { ...row, ...next } : row)) ?? prev,
    );

  const patchAssessment = (key: string, next: Partial<AssessmentRow>) =>
    setAssessmentRows(
      (prev) => prev?.map((row) => (row.key === key ? { ...row, ...next } : row)) ?? prev,
    );

  const selectedOutcomes = (outcomeRows ?? []).filter((row) => row.selected);
  const selectedAssessments = (assessmentRows ?? []).filter((row) => row.selected);
  const nothingSelected = selectedOutcomes.length === 0 && selectedAssessments.length === 0;

  const createSelected = async () => {
    if (!curriculumVersionId) {
      setCreateErrors([
        "Aucune version de curriculum réelle pour ce programme : impossible de créer.",
      ]);
      return;
    }
    setCreating(true);
    setCreateSummary(null);
    setCreateErrors([]);

    // Garde-fou avant l'appel réseau : un code/nom déjà présent dans ce
    // programme (créé ici ou ailleurs depuis l'analyse) échouerait sur la
    // contrainte SQL unique — on le détecte ici pour un message clair,
    // plutôt que de laisser remonter l'erreur Postgres brute.
    const preErrors: string[] = [];
    const seenCodes = new Set<string>();
    const outcomesToCreate = selectedOutcomes.filter((row) => {
      const codeUpper = row.code.trim().toUpperCase();
      if (existingCodeSet.has(codeUpper) || seenCodes.has(codeUpper)) {
        preErrors.push(
          `« ${row.label || row.code} » : le code « ${row.code.trim().toUpperCase()} » est déjà utilisé dans ce programme — modifiez le code ou décochez cet élément.`,
        );
        return false;
      }
      seenCodes.add(codeUpper);
      return true;
    });
    const seenNames = new Set<string>();
    const assessmentsToCreate = selectedAssessments.filter((row) => {
      const nameLower = row.name.trim().toLowerCase();
      if (existingNameSet.has(nameLower) || seenNames.has(nameLower)) {
        preErrors.push(
          `« ${row.name} » : une modalité porte déjà ce nom dans ce programme — renommez-la ou décochez-la.`,
        );
        return false;
      }
      seenNames.add(nameLower);
      return true;
    });

    const outcomeResults = await Promise.allSettled(
      outcomesToCreate.map((row) =>
        dataAccess.outcomes.createOutcome({
          programId,
          curriculumVersionId,
          code: row.code.trim().toUpperCase(),
          label: row.label.trim(),
          description: row.description.trim(),
          nature: row.nature,
          domain: row.domain.trim(),
          targetMastery: row.targetMastery,
        }),
      ),
    );
    const assessmentResults = await Promise.allSettled(
      assessmentsToCreate.map((row) =>
        dataAccess.assessments.createAssessmentModality({
          programId,
          name: row.name.trim(),
          // Présomption du format, pas déduction : voir MODE_PRESUME_DU_FORMAT.
          mode: MODE_PRESUME_DU_FORMAT[row.subtype],
          subtype: row.subtype,
          usage: row.usage,
          notes: row.notes.trim(),
        }),
      ),
    );

    const errors: string[] = [...preErrors];
    const createdOutcomeKeys = new Set<string>();
    outcomeResults.forEach((result, index) => {
      const row = outcomesToCreate[index];
      if (!row) return;
      if (result.status === "fulfilled") {
        createdOutcomeKeys.add(row.key);
      } else {
        errors.push(
          `« ${row.label || row.code} » : ${
            result.reason instanceof Error ? result.reason.message : "échec de création"
          }`,
        );
      }
    });
    const createdAssessmentKeys = new Set<string>();
    assessmentResults.forEach((result, index) => {
      const row = assessmentsToCreate[index];
      if (!row) return;
      if (result.status === "fulfilled") {
        createdAssessmentKeys.add(row.key);
      } else {
        errors.push(
          `« ${row.name} » : ${result.reason instanceof Error ? result.reason.message : "échec de création"}`,
        );
      }
    });

    // On retire du tableau ce qui a été créé avec succès ; ce qui a échoué
    // reste affiché, coché, pour correction et nouvel essai.
    setOutcomeRows((prev) => prev?.filter((row) => !createdOutcomeKeys.has(row.key)) ?? prev);
    setAssessmentRows((prev) => prev?.filter((row) => !createdAssessmentKeys.has(row.key)) ?? prev);

    const createdCount = createdOutcomeKeys.size + createdAssessmentKeys.size;
    if (createdCount > 0) {
      setCreateSummary(
        `${createdCount} élément(s) créé(s) dans le référentiel${errors.length > 0 ? " (voir les échecs ci-dessous)" : ""}.`,
      );
      onCreated?.();
    }
    setCreateErrors(errors);
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={analyzing || objectives.trim().length === 0}
          onClick={() => void runAnalysis()}
        >
          {analyzing ? (
            <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="me-1 size-4" aria-hidden />
          )}
          Analyser avec l'IA
        </Button>
        {analyzing ? (
          <span className="text-muted-foreground text-xs">
            Lecture des objectifs et proposition du référentiel…
          </span>
        ) : analysisError ? (
          <span className="text-destructive text-xs">{analysisError}</span>
        ) : objectives.trim().length === 0 ? (
          <span className="text-muted-foreground text-xs">
            Renseignez ou importez d'abord les objectifs pédagogiques.
          </span>
        ) : null}
      </div>

      {truncatedNotice ? (
        <p className="text-muted-foreground text-xs">
          Le texte des objectifs était long : seule la première partie a été analysée.
        </p>
      ) : null}

      {hasResult ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Proposition à valider — tout est modifiable, décochez ce que vous ne voulez pas créer.
            Rien n'est encore enregistré.
          </p>

          {(outcomeRows?.length ?? 0) === 0 && (assessmentRows?.length ?? 0) === 0 ? (
            <EmptyState>Aucun élément détecté dans le texte fourni.</EmptyState>
          ) : null}

          {outcomeRows && outcomeRows.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                Connaissances &amp; compétences proposées ({outcomeRows.length})
              </h4>
              <div className="space-y-2">
                {outcomeRows.map((row) => (
                  <div
                    key={row.key}
                    className={`rounded-lg border p-4 ${row.selected ? "border-primary/40 bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={(checked) =>
                          patchOutcome(row.key, { selected: checked === true })
                        }
                        aria-label={`Créer « ${row.label || row.code} »`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        {row.duplicateOnLoad ? (
                          <Badge variant="outline" className="text-muted-foreground font-normal">
                            Code déjà présent dans ce programme — décoché par défaut
                          </Badge>
                        ) : null}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                          <Input
                            value={row.label}
                            onChange={(e) => patchOutcome(row.key, { label: e.target.value })}
                            placeholder="Intitulé"
                          />
                          <Input
                            value={row.code}
                            onChange={(e) => patchOutcome(row.key, { code: e.target.value })}
                            placeholder="Code"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Input
                            value={row.domain}
                            onChange={(e) => patchOutcome(row.key, { domain: e.target.value })}
                            placeholder="Domaine"
                          />
                          <select
                            className={SELECT_CLASS}
                            value={row.nature}
                            onChange={(e) =>
                              patchOutcome(row.key, { nature: e.target.value as OutcomeNature })
                            }
                          >
                            {(Object.keys(OUTCOME_NATURE_LABELS_FR) as OutcomeNature[]).map(
                              (nature) => (
                                <option key={nature} value={nature}>
                                  {OUTCOME_NATURE_LABELS_FR[nature]}
                                </option>
                              ),
                            )}
                          </select>
                          <select
                            className={SELECT_CLASS}
                            value={row.targetMastery}
                            onChange={(e) =>
                              patchOutcome(row.key, {
                                targetMastery: e.target.value as MasteryLevel,
                              })
                            }
                          >
                            {(Object.keys(COMPETENCE_MASTERY_LABELS_FR) as MasteryLevel[]).map(
                              (level) => (
                                <option key={level} value={level}>
                                  {COMPETENCE_MASTERY_LABELS_FR[level]}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        <Textarea
                          rows={2}
                          value={row.description}
                          onChange={(e) => patchOutcome(row.key, { description: e.target.value })}
                          placeholder="Description"
                        />
                        {row.sourceExcerpt ? (
                          <p className="text-muted-foreground text-xs italic">
                            Extrait source : « {row.sourceExcerpt} »
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {assessmentRows && assessmentRows.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                Modalités d'évaluation proposées ({assessmentRows.length})
              </h4>
              <div className="space-y-2">
                {assessmentRows.map((row) => (
                  <div
                    key={row.key}
                    className={`rounded-lg border p-4 ${row.selected ? "border-primary/40 bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={(checked) =>
                          patchAssessment(row.key, { selected: checked === true })
                        }
                        aria-label={`Créer « ${row.name} »`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        {row.duplicateOnLoad ? (
                          <Badge variant="outline" className="text-muted-foreground font-normal">
                            Nom déjà présent dans ce programme — décoché par défaut
                          </Badge>
                        ) : null}
                        <Input
                          value={row.name}
                          onChange={(e) => patchAssessment(row.key, { name: e.target.value })}
                          placeholder="Nom de la modalité"
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <select
                            className={SELECT_CLASS}
                            value={row.subtype}
                            onChange={(e) =>
                              patchAssessment(row.key, {
                                subtype: e.target.value as AssessmentSubtype,
                              })
                            }
                          >
                            {(Object.keys(ASSESSMENT_SUBTYPE_LABELS_FR) as AssessmentSubtype[]).map(
                              (subtype) => (
                                <option key={subtype} value={subtype}>
                                  {ASSESSMENT_SUBTYPE_LABELS_FR[subtype]}
                                </option>
                              ),
                            )}
                          </select>
                          <select
                            className={SELECT_CLASS}
                            value={row.usage}
                            onChange={(e) =>
                              patchAssessment(row.key, { usage: e.target.value as AssessmentUsage })
                            }
                          >
                            {(Object.keys(ASSESSMENT_USAGE_LABELS_FR) as AssessmentUsage[]).map(
                              (usage) => (
                                <option key={usage} value={usage}>
                                  {ASSESSMENT_USAGE_LABELS_FR[usage]}
                                </option>
                              ),
                            )}
                          </select>
                          <Badge variant="outline" className="w-fit self-center font-normal">
                            {row.subtype === "oral" ||
                            row.subtype === "written" ||
                            row.subtype === "practical"
                              ? "En présentiel"
                              : "En ligne"}
                          </Badge>
                        </div>
                        <Input
                          value={row.notes}
                          onChange={(e) => patchAssessment(row.key, { notes: e.target.value })}
                          placeholder="Notes (facultatif)"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(outcomeRows?.length ?? 0) > 0 || (assessmentRows?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="min-h-11"
                disabled={creating || nothingSelected || !curriculumVersionId}
                onClick={() => void createSelected()}
              >
                {creating ? (
                  <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="me-1 size-4" aria-hidden />
                )}
                Créer les éléments sélectionnés (
                {selectedOutcomes.length + selectedAssessments.length})
              </Button>
              {!curriculumVersionId ? (
                <span className="text-muted-foreground text-xs">
                  Aucune version de curriculum réelle pour ce programme.
                </span>
              ) : null}
            </div>
          ) : null}

          {createSummary ? <p className="text-muted-foreground text-sm">{createSummary}</p> : null}
          {createErrors.length > 0 ? (
            <ul className="space-y-1">
              {createErrors.map((message) => (
                <li key={message} className="text-destructive flex items-start gap-1.5 text-xs">
                  <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
