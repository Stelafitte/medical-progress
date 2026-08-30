/**
 * Outil UNIQUE de création d'un terrain de stage.
 *
 * Le même composant sert dans l'onglet « Gestion des stages » et dans le
 * « Concepteur de programme » : dans les deux cas le terrain est rattaché au
 * programme courant et rejoint la liste unique des terrains de stage.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_NEW_PLACEMENT_INPUT,
  NEW_PLACEMENT_ISSUE_LABELS_FR,
  STAGE_VALIDATION_LABELS_FR,
  type NewPlacementInput,
  type StageValidationMode,
  validateNewPlacement,
} from "@/domain/placementDraft";
import { createLocalPlacement } from "@/application/placementDraftStore";
import type { LocalPlacement } from "@/domain/placementDraft";
import type { ProgramId } from "@/domain/types";

interface PlacementCreationFormProps {
  readonly programId: ProgramId;
  /** Libellé du bouton, adapté au contexte d'appel. */
  readonly submitLabel: string;
  /** Phrase expliquant où le terrain apparaîtra ensuite. */
  readonly hint: string;
  readonly onCreated?: (created: LocalPlacement) => void;
  readonly idPrefix?: string;
}

export function PlacementCreationForm({
  programId,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "placement",
}: PlacementCreationFormProps) {
  const [input, setInput] = useState<NewPlacementInput>(EMPTY_NEW_PLACEMENT_INPUT);
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const issues = validateNewPlacement(input);
  const patch = (next: Partial<NewPlacementInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  const submit = () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const local = createLocalPlacement({ input, programId });
    if (!local) return;
    setInput(EMPTY_NEW_PLACEMENT_INPUT);
    setShowIssues(false);
    setCreated(local.placement.name);
    onCreated?.(local);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Nom du terrain de stage</Label>
          <Input
            id={`${idPrefix}-name`}
            value={input.name}
            placeholder="Échocardiographie — CHU"
            onChange={(e) => patch({ name: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-site`}>Établissement / lieu</Label>
          <Input
            id={`${idPrefix}-site`}
            value={input.site}
            placeholder="CHU de Rouen"
            onChange={(e) => patch({ site: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-department`}>Service</Label>
          <Input
            id={`${idPrefix}-department`}
            value={input.department}
            placeholder="Cardiologie"
            onChange={(e) => patch({ department: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-capacity`}>Places d'accueil</Label>
          <Input
            id={`${idPrefix}-capacity`}
            inputMode="numeric"
            value={input.capacity}
            placeholder="4"
            onChange={(e) => patch({ capacity: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-supervisor`}>Encadrant rattaché (optionnel)</Label>
          <Input
            id={`${idPrefix}-supervisor`}
            value={input.supervisor}
            placeholder="Dr Martin"
            onChange={(e) => patch({ supervisor: e.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-validation`}>Mode de validation</Label>
          <select
            id={`${idPrefix}-validation`}
            value={input.validationMode}
            onChange={(e) => patch({ validationMode: e.target.value as StageValidationMode })}
            className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
          >
            {(Object.keys(STAGE_VALIDATION_LABELS_FR) as StageValidationMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {STAGE_VALIDATION_LABELS_FR[mode]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_PLACEMENT_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" onClick={submit}>
          {submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » est créé et visible dans le concepteur comme dans « Gestion des stages ».
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
