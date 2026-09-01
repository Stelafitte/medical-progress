/**
 * Outil UNIQUE de création ET de reprise d'une classe (promotion).
 *
 * Le même composant sert dans le « Concepteur de programme » et dans l'onglet
 * « Classes d'apprenants », et pour les deux gestes : créer une classe, ou
 * reprendre une classe existante. C'est délibéré — un formulaire d'édition
 * jumeau finirait par diverger du formulaire de création, et on se retrouverait
 * avec un champ modifiable à la création mais pas à la reprise, ce que rien à
 * l'écran n'expliquerait.
 *
 * `cohort` absent = création. `cohort` fourni = reprise de cette classe :
 * `program_id` et `curriculum_version_id` ne sont alors PAS modifiables, parce
 * que déplacer une classe d'un programme à l'autre laisserait ses inscriptions,
 * ses jalons et ses carnets rattachés à l'ancien.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  academicYearFor,
  cohortFormInputFrom,
  EMPTY_NEW_COHORT_INPUT,
  NEW_COHORT_ISSUE_LABELS_FR,
  type NewCohortInput,
  validateNewCohort,
} from "@/domain/cohortDraft";
import { useDataAccess } from "@/application/session";
import type { Cohort, CurriculumVersionId, ProgramId } from "@/domain/types";

interface CohortFormProps {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Libellé du bouton, adapté au contexte d'appel. */
  readonly submitLabel: string;
  /** Phrase expliquant où la classe apparaîtra ensuite. */
  readonly hint: string;
  /** Classe à reprendre. Absente = création. */
  readonly cohort?: Cohort;
  readonly onCreated?: (cohort: Cohort) => void;
  readonly onCancel?: () => void;
  readonly idPrefix?: string;
}

export function CohortForm({
  programId,
  curriculumVersionId,
  submitLabel,
  hint,
  cohort,
  onCreated,
  onCancel,
  idPrefix = "cohort",
}: CohortFormProps) {
  const dataAccess = useDataAccess();
  const editing = cohort !== undefined;
  const [input, setInput] = useState<NewCohortInput>(
    cohort ? cohortFormInputFrom(cohort) : EMPTY_NEW_COHORT_INPUT,
  );
  const [showIssues, setShowIssues] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const issues = validateNewCohort(input);
  const patch = (next: Partial<NewCohortInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setDone(null);
    setSubmitError(null);
  };

  async function submit() {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const academicYear = input.academicYear.trim() || academicYearFor(input.startsOn);
      const saved = editing
        ? await dataAccess.programs.updateCohort({
            cohortId: cohort.id,
            label: input.label.trim(),
            academicYear,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
          })
        : await dataAccess.programs.createCohort({
            programId,
            curriculumVersionId,
            label: input.label.trim(),
            academicYear,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
          });
      // À la création on repart d'un formulaire vide pour enchaîner ; à la
      // reprise on garde les valeurs à l'écran, qui sont désormais celles de la
      // base — les vider donnerait l'impression d'avoir perdu la classe.
      if (!editing) setInput(EMPTY_NEW_COHORT_INPUT);
      setShowIssues(false);
      setDone(saved.label);
      onCreated?.(saved);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : editing
            ? "Modification de la classe impossible."
            : "Création de la classe impossible.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Nom de la classe</Label>
          <Input
            id={`${idPrefix}-label`}
            value={input.label}
            placeholder="Promotion 2026-2027"
            onChange={(e) => patch({ label: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`}>Début</Label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={input.startsOn}
            onChange={(e) => patch({ startsOn: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`}>Fin</Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={input.endsOn}
            onChange={(e) => patch({ endsOn: e.target.value })}
            className="min-h-11"
          />
        </div>
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_COHORT_ISSUE_LABELS_FR[issue]}</li>
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
          {isSubmitting ? (editing ? "Enregistrement…" : "Création en cours…") : submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
        ) : null}
        {done ? (
          <span className="text-muted-foreground text-sm">
            {editing
              ? `« ${done} » est enregistrée.`
              : `« ${done} » est créée et visible dans le concepteur comme dans « Classes d'apprenants ».`}
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
