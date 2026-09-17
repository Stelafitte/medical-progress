/**
 * Outil UNIQUE de création d'une pièce exigée par le programme.
 * Réutilisable dans l'onglet « Documents et certificats » comme dans le
 * « Concepteur de programme » : la liste des pièces reste unique.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDocumentRequirement } from "@/application/documentRequirementStore";
import {
  DOCUMENT_DUE_LABELS_FR,
  DOCUMENT_PROVIDER_LABELS_FR,
  DOCUMENT_VALIDATOR_LABELS_FR,
  EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
  NEW_DOCUMENT_REQUIREMENT_ISSUE_LABELS_FR,
  validateNewDocumentRequirement,
  type DocumentDueMoment,
  type DocumentProvider,
  type DocumentRequirement,
  type DocumentValidator,
  type NewDocumentRequirementInput,
} from "@/domain/documentRequirement";
import type { ProgramId } from "@/domain/types";

const SELECT_CLASS = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

export function DocumentRequirementForm({
  programId,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "document-requirement",
}: {
  programId: ProgramId;
  submitLabel: string;
  hint: string;
  onCreated?: (created: DocumentRequirement) => void;
  idPrefix?: string;
}) {
  const [input, setInput] = useState<NewDocumentRequirementInput>(
    EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
  );
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const issues = validateNewDocumentRequirement(input);
  const patch = (next: Partial<NewDocumentRequirementInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  const submit = async () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const requirement = await createDocumentRequirement({ input, programId });
    if (!requirement) return;
    setInput(EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT);
    setShowIssues(false);
    setCreated(requirement.label);
    onCreated?.(requirement);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-code`}>Code</Label>
          <Input
            id={`${idPrefix}-code`}
            value={input.code}
            placeholder="DOC-04"
            onChange={(event) => patch({ code: event.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Intitulé de la pièce</Label>
          <Input
            id={`${idPrefix}-label`}
            value={input.label}
            placeholder="Attestation d'assurance responsabilité civile"
            onChange={(event) => patch({ label: event.target.value })}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-provider`}>Fournie par</Label>
          <select
            id={`${idPrefix}-provider`}
            value={input.provider}
            onChange={(event) => patch({ provider: event.target.value as DocumentProvider })}
            className={SELECT_CLASS}
          >
            {(Object.keys(DOCUMENT_PROVIDER_LABELS_FR) as DocumentProvider[]).map((provider) => (
              <option key={provider} value={provider}>
                {DOCUMENT_PROVIDER_LABELS_FR[provider]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-validator`}>Validée par</Label>
          <select
            id={`${idPrefix}-validator`}
            value={input.validator}
            onChange={(event) => patch({ validator: event.target.value as DocumentValidator })}
            className={SELECT_CLASS}
          >
            {(Object.keys(DOCUMENT_VALIDATOR_LABELS_FR) as DocumentValidator[]).map((validator) => (
              <option key={validator} value={validator}>
                {DOCUMENT_VALIDATOR_LABELS_FR[validator]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-due`}>Échéance attendue</Label>
          <select
            id={`${idPrefix}-due`}
            value={input.due}
            onChange={(event) => patch({ due: event.target.value as DocumentDueMoment })}
            className={SELECT_CLASS}
          >
            {(Object.keys(DOCUMENT_DUE_LABELS_FR) as DocumentDueMoment[]).map((due) => (
              <option key={due} value={due}>
                {DOCUMENT_DUE_LABELS_FR[due]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={input.mandatory}
              onChange={(event) => patch({ mandatory: event.target.checked })}
              className="size-4"
            />
            Pièce obligatoire
          </label>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-notes`}>Précisions (optionnel)</Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={2}
            value={input.notes}
            placeholder="Format accepté, durée de validité, service destinataire."
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </div>
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_DOCUMENT_REQUIREMENT_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" onClick={submit}>
          {submitLabel}
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
