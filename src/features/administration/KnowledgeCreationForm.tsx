/**
 * Outil UNIQUE de création d'une connaissance.
 * Réutilisable dans l'onglet « Base de connaissances » comme dans le
 * « Concepteur de programme » : la liste des objectifs reste unique.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMPETENCE_MASTERY_LABELS_FR } from "@/domain/competenceDraft";
import {
  EMPTY_NEW_KNOWLEDGE_INPUT,
  NEW_KNOWLEDGE_ISSUE_LABELS_FR,
  validateNewKnowledge,
  type NewKnowledgeInput,
} from "@/domain/knowledgeDraft";
import { useDataAccess } from "@/application/session";
import {
  attachOutcomeContent,
  attachOutcomeLink,
  normalizeCourseUrl,
} from "@/features/administration/attachOutcomeContent";
import type { CurriculumVersionId, MasteryLevel, Outcome, ProgramId } from "@/domain/types";

const TARGET_LEVELS: readonly MasteryLevel[] = [
  "novice",
  "intermediate",
  "proficient",
  "autonomous",
];

export function KnowledgeCreationForm({
  programId,
  curriculumVersionId,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "knowledge",
}: {
  programId: ProgramId;
  curriculumVersionId: CurriculumVersionId;
  submitLabel: string;
  hint: string;
  onCreated?: (created: Outcome) => void;
  idPrefix?: string;
}) {
  const dataAccess = useDataAccess();
  const [input, setInput] = useState<NewKnowledgeInput>(EMPTY_NEW_KNOWLEDGE_INPUT);
  // Le niveau attendu n'est pris en compte qu'une fois choisi explicitement :
  // pas de niveau pré-rempli silencieusement accepté à la création.
  const [targetTouched, setTargetTouched] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Contenu pédagogique saisi à la main. Volontairement hors du brouillon du
   * domaine : il ne décrit pas l'acquis, il devient un support rattaché. */
  const [content, setContent] = useState("");
  /** Lien vers un cours en ligne (18/09) : devient un support `link` rattaché. */
  const [lien, setLien] = useState("");
  const lienInvalide = lien.trim().length > 0 && normalizeCourseUrl(lien) === null;
  const [contentWarning, setContentWarning] = useState<string | null>(null);

  const issues = validateNewKnowledge(input);
  const patch = (next: Partial<NewKnowledgeInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  async function submit() {
    if (issues.length > 0 || !targetTouched || lienInvalide) {
      setShowIssues(true);
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const outcome = await dataAccess.outcomes.createOutcome({
        programId,
        curriculumVersionId,
        code: input.code.trim().toUpperCase(),
        label: input.label.trim(),
        description: input.description.trim(),
        nature: "knowledge",
        domain: input.domain.trim().length > 0 ? input.domain.trim() : "Non classé",
        targetMastery: input.targetMastery,
      });
      // L'acquis est créé ; le contenu est un second geste qui ne doit pas
      // pouvoir l'annuler. Un échec ici est signalé, pas propagé.
      try {
        await attachOutcomeContent(dataAccess, {
          programId,
          curriculumVersionId,
          outcome,
          content,
        });
        await attachOutcomeLink(dataAccess, {
          programId,
          curriculumVersionId,
          outcome,
          url: lien,
        });
        setContentWarning(null);
      } catch (reason) {
        setContentWarning(
          reason instanceof Error
            ? `L'acquis est créé, mais son contenu n'a pas pu être enregistré : ${reason.message}`
            : "L'acquis est créé, mais son contenu n'a pas pu être enregistré.",
        );
      }
      setContent("");
      setLien("");
      setInput(EMPTY_NEW_KNOWLEDGE_INPUT);
      setTargetTouched(false);
      setShowIssues(false);
      setCreated(outcome.label);
      onCreated?.(outcome);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error ? reason.message : "Création de la connaissance impossible.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-code`}>Code</Label>
          <Input
            id={`${idPrefix}-code`}
            value={input.code}
            placeholder="K-08"
            onChange={(e) => patch({ code: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Intitulé</Label>
          <Input
            id={`${idPrefix}-label`}
            value={input.label}
            placeholder="Physique des ultrasons"
            onChange={(e) => patch({ label: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-domain`}>Domaine (optionnel)</Label>
          <Input
            id={`${idPrefix}-domain`}
            value={input.domain}
            placeholder="Bases physiques"
            onChange={(e) => patch({ domain: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-target`}>Niveau attendu</Label>
          <select
            id={`${idPrefix}-target`}
            value={targetTouched ? input.targetMastery : ""}
            onChange={(e) => {
              setTargetTouched(true);
              patch({ targetMastery: e.target.value as MasteryLevel });
            }}
            className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
          >
            <option value="" disabled>
              Choisir un niveau…
            </option>
            {TARGET_LEVELS.map((level) => (
              <option key={level} value={level}>
                {COMPETENCE_MASTERY_LABELS_FR[level]}
              </option>
            ))}
          </select>
          {showIssues && !targetTouched ? (
            <p className="text-destructive text-xs">Choisissez un niveau attendu.</p>
          ) : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-description`}>Attendu (optionnel)</Label>
          <Textarea
            id={`${idPrefix}-description`}
            rows={2}
            value={input.description}
            placeholder="Ce que l'apprenant doit savoir expliquer ou reconnaître."
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-content`}>Contenu (optionnel)</Label>
          <Textarea
            id={`${idPrefix}-content`}
            rows={6}
            value={content}
            placeholder="Le cours lui-même : définitions, mécanismes, points clés. Ce texte devient un support rattaché à cet acquis, exploitable comme un document importé."
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Distinct de l'attendu ci-dessus : l'attendu dit ce que l'apprenant doit savoir, le
            contenu est la matière elle-même. Il rejoint la médiathèque du programme, au même
            endroit que les documents importés, et reste modifiable ensuite.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-link`}>Lien vers un cours en ligne (optionnel)</Label>
          <Input
            id={`${idPrefix}-link`}
            type="url"
            inputMode="url"
            value={lien}
            placeholder="https://…"
            onChange={(e) => setLien(e.target.value)}
            aria-invalid={lienInvalide}
            className="min-h-11"
          />
          <p
            className={lienInvalide ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
          >
            {lienInvalide
              ? "Adresse invalide : elle doit commencer par https:// (ou http://)."
              : "Une page web, une vidéo hébergée ailleurs, un cours d'une autre plateforme. L'apprenant l'ouvre d'un clic, sous cette connaissance, une fois sa promotion ouverte."}
          </p>
        </div>
      </div>

      {contentWarning ? <p className="text-destructive text-sm">{contentWarning}</p> : null}

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_KNOWLEDGE_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="min-h-11"
          onClick={() => void submit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Création en cours…" : submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » ajoutée à la liste de cette session.
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
