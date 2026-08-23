/**
 * Outil UNIQUE de création d'une modalité d'évaluation.
 * Le même composant sert dans l'onglet « Évaluations » et dans le pilotage.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  EMPTY_NEW_MODALITY_INPUT,
  NEW_MODALITY_ISSUE_LABELS_FR,
  SUBTYPES_BY_MODE,
  validateNewModality,
  type AssessmentMode,
  type AssessmentModality,
  type AssessmentSubtype,
  type AssessmentUsage,
  type NewAssessmentModalityInput,
} from "@/domain/assessmentModality";
import { createLocalModality } from "@/application/assessmentModalityStore";
import type { ProgramId } from "@/domain/types";

const SELECT_CLASS =
  "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

export function AssessmentModalityForm({
  programId,
  submitLabel = "Créer la modalité d'évaluation",
  hint,
  onCreated,
  idPrefix = "modality",
}: {
  readonly programId: ProgramId;
  readonly submitLabel?: string;
  readonly hint: string;
  readonly onCreated?: (created: AssessmentModality) => void;
  readonly idPrefix?: string;
}) {
  const [input, setInput] = useState<NewAssessmentModalityInput>(EMPTY_NEW_MODALITY_INPUT);
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const issues = validateNewModality(input);
  const patch = (next: Partial<NewAssessmentModalityInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  const changeMode = (mode: AssessmentMode) => {
    const first = SUBTYPES_BY_MODE[mode][0] as AssessmentSubtype;
    patch({ mode, subtype: first });
  };

  const submit = () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const modality = createLocalModality({ input, programId });
    if (!modality) return;
    setInput(EMPTY_NEW_MODALITY_INPUT);
    setShowIssues(false);
    setCreated(modality.name);
    onCreated?.(modality);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-name`}>Nom de la modalité</Label>
          <Input
            id={`${idPrefix}-name`}
            value={input.name}
            placeholder="Épreuve écrite de validation"
            onChange={(e) => patch({ name: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-mode`}>Type</Label>
          <select
            id={`${idPrefix}-mode`}
            value={input.mode}
            onChange={(e) => changeMode(e.target.value as AssessmentMode)}
            className={SELECT_CLASS}
          >
            {(Object.keys(ASSESSMENT_MODE_LABELS_FR) as AssessmentMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {ASSESSMENT_MODE_LABELS_FR[mode]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-subtype`}>Sous-type</Label>
          <select
            id={`${idPrefix}-subtype`}
            value={input.subtype}
            onChange={(e) => patch({ subtype: e.target.value as AssessmentSubtype })}
            className={SELECT_CLASS}
          >
            {SUBTYPES_BY_MODE[input.mode].map((subtype) => (
              <option key={subtype} value={subtype}>
                {ASSESSMENT_SUBTYPE_LABELS_FR[subtype]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-usage`}>Modalité d'utilisation</Label>
          <select
            id={`${idPrefix}-usage`}
            value={input.usage}
            onChange={(e) => patch({ usage: e.target.value as AssessmentUsage })}
            className={SELECT_CLASS}
          >
            {(Object.keys(ASSESSMENT_USAGE_LABELS_FR) as AssessmentUsage[]).map((usage) => (
              <option key={usage} value={usage}>
                {ASSESSMENT_USAGE_LABELS_FR[usage]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Dates</Label>
          <p className="text-muted-foreground border-border rounded-md border px-3 py-2.5 text-xs">
            La date de création et la date de mise à jour sont enregistrées automatiquement.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-notes`}>Précisions (optionnel)</Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={2}
            value={input.notes}
            placeholder="Conditions de passage, durée, correction…"
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_MODALITY_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" onClick={submit}>
          {submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » est ajoutée aux modalités du programme.
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
