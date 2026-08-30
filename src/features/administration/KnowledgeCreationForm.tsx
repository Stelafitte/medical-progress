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

  const issues = validateNewKnowledge(input);
  const patch = (next: Partial<NewKnowledgeInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  async function submit() {
    if (issues.length > 0 || !targetTouched) {
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
      </div>

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
