/**
 * Outil UNIQUE de création de classe (promotion).
 *
 * Le même composant est utilisé dans le « Concepteur de programme » et dans
 * l'onglet « Classes d'apprenants ». Dans les deux cas la classe créée est
 * rattachée au programme courant et rejoint la liste unique des classes.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  academicYearFor,
  EMPTY_NEW_COHORT_INPUT,
  NEW_COHORT_ISSUE_LABELS_FR,
  type NewCohortInput,
  validateNewCohort,
} from "@/domain/cohortDraft";
import { useDataAccess } from "@/application/session";
import type { Cohort, CurriculumVersionId, ProgramId } from "@/domain/types";

interface CohortCreationFormProps {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Libellé du bouton, adapté au contexte d'appel. */
  readonly submitLabel: string;
  /** Phrase expliquant où la classe apparaîtra ensuite. */
  readonly hint: string;
  readonly onCreated?: (cohort: Cohort) => void;
  readonly idPrefix?: string;
}

export function CohortCreationForm({
  programId,
  curriculumVersionId,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "cohort",
}: CohortCreationFormProps) {
  const dataAccess = useDataAccess();
  const [input, setInput] = useState<NewCohortInput>(EMPTY_NEW_COHORT_INPUT);
  const [showIssues, setShowIssues] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const issues = validateNewCohort(input);
  const patch = (next: Partial<NewCohortInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
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
      const cohort = await dataAccess.programs.createCohort({
        programId,
        curriculumVersionId,
        label: input.label.trim(),
        academicYear: input.academicYear.trim() || academicYearFor(input.startsOn),
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      });
      setInput(EMPTY_NEW_COHORT_INPUT);
      setShowIssues(false);
      setCreated(cohort.label);
      onCreated?.(cohort);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error ? reason.message : "Création de la classe impossible.",
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
          {isSubmitting ? "Création en cours…" : submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » est créée et visible dans le concepteur comme dans « Classes d'apprenants
            ».
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
