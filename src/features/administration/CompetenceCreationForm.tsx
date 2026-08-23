/**
 * Outil UNIQUE de création d'une compétence.
 *
 * Le même composant sert dans l'onglet « Compétences » et dans le « Concepteur
 * de programme » : dans les deux cas la compétence est rattachée au programme
 * courant et rejoint la liste unique des compétences.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  COMPETENCE_NATURE_LABELS_FR,
  EMPTY_NEW_COMPETENCE_INPUT,
  NEW_COMPETENCE_ISSUE_LABELS_FR,
  type CompetenceNature,
  type NewCompetenceInput,
  validateNewCompetence,
} from "@/domain/competenceDraft";
import { createLocalCompetence } from "@/application/competenceDraftStore";
import type { CurriculumVersionId, MasteryLevel, Outcome, ProgramId } from "@/domain/types";

const TARGET_LEVELS: readonly MasteryLevel[] = [
  "novice",
  "intermediate",
  "proficient",
  "autonomous",
];

interface CompetenceCreationFormProps {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  /** Libellé du bouton, adapté au contexte d'appel. */
  readonly submitLabel: string;
  /** Phrase expliquant où la compétence apparaîtra ensuite. */
  readonly hint: string;
  readonly onCreated?: (created: Outcome) => void;
  readonly idPrefix?: string;
}

export function CompetenceCreationForm({
  programId,
  curriculumVersionId,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "competence",
}: CompetenceCreationFormProps) {
  const [input, setInput] = useState<NewCompetenceInput>(EMPTY_NEW_COMPETENCE_INPUT);
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const issues = validateNewCompetence(input);
  const patch = (next: Partial<NewCompetenceInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  const submit = () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const outcome = createLocalCompetence({ input, programId, curriculumVersionId });
    if (!outcome) return;
    setInput(EMPTY_NEW_COMPETENCE_INPUT);
    setShowIssues(false);
    setCreated(outcome.label);
    onCreated?.(outcome);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-code`}>Code</Label>
          <Input
            id={`${idPrefix}-code`}
            value={input.code}
            placeholder="C-14"
            onChange={(e) => patch({ code: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Intitulé</Label>
          <Input
            id={`${idPrefix}-label`}
            value={input.label}
            placeholder="Réaliser une ETT complète"
            onChange={(e) => patch({ label: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-domain`}>Domaine (optionnel)</Label>
          <Input
            id={`${idPrefix}-domain`}
            value={input.domain}
            placeholder="Échocardiographie"
            onChange={(e) => patch({ domain: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-nature`}>Nature</Label>
          <select
            id={`${idPrefix}-nature`}
            value={input.nature}
            onChange={(e) => patch({ nature: e.target.value as CompetenceNature })}
            className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
          >
            {(Object.keys(COMPETENCE_NATURE_LABELS_FR) as CompetenceNature[]).map((nature) => (
              <option key={nature} value={nature}>
                {COMPETENCE_NATURE_LABELS_FR[nature]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-target`}>Niveau attendu</Label>
          <select
            id={`${idPrefix}-target`}
            value={input.targetMastery}
            onChange={(e) => patch({ targetMastery: e.target.value as MasteryLevel })}
            className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
          >
            {TARGET_LEVELS.map((level) => (
              <option key={level} value={level}>
                {COMPETENCE_MASTERY_LABELS_FR[level]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-description`}>Attendu observable (optionnel)</Label>
          <Textarea
            id={`${idPrefix}-description`}
            rows={2}
            value={input.description}
            placeholder="Ce que l'encadrant doit constater pour valider la compétence."
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_COMPETENCE_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" onClick={submit}>
          {submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » est créée et visible dans le concepteur comme dans l'onglet
            « Compétences ».
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
      <p className="text-muted-foreground text-xs">
        Une compétence en situation réelle ne pourra jamais être déclarée acquise par l'apprenant
        seul : la validation par un tiers habilité reste obligatoire.
      </p>
    </div>
  );
}
