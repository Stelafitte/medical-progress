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
  type NewPlacementInput,
  validateNewPlacement,
} from "@/domain/placementDraft";
import { useDataAccess } from "@/application/session";
import type { Placement, ProgramId } from "@/domain/types";

interface PlacementCreationFormProps {
  readonly programId: ProgramId;
  /** Libellé du bouton, adapté au contexte d'appel. */
  readonly submitLabel: string;
  /** Phrase expliquant où le terrain apparaîtra ensuite. */
  readonly hint: string;
  readonly onCreated?: (created: Placement) => void;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataAccess = useDataAccess();

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
    void createRealPlacement();
  };

  /**
   * ÉCRITURE RÉELLE (07/09). La table `placements` n'accepte aucun `insert`
   * direct : la migration révoque tout et n'accorde que le `select`. On passe
   * donc par `create_placement`, qui vérifie les droits côté serveur.
   *
   * Deux champs de la maquette ont disparu du formulaire : « Encadrant » et le
   * mode de validation n'ont AUCUNE colonne d'accueil. Les encadrants se
   * règlent par groupe, dans « Encadrement de la promotion ».
   */
  async function createRealPlacement() {
    setBusy(true);
    setError(null);
    try {
      const capacity = Number(input.capacity.trim());
      const created = await dataAccess.placements.createPlacement({
        programId,
        name: input.name.trim(),
        site: input.site.trim(),
        department: input.department.trim(),
        capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 0,
      });
      setInput(EMPTY_NEW_PLACEMENT_INPUT);
      setShowIssues(false);
      setCreated(created.name);
      onCreated?.(created);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Création du terrain de stage impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

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
      </div>

      {showIssues && issues.length > 0 ? (
        <ul className="text-destructive space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{NEW_PLACEMENT_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" disabled={busy} onClick={submit}>
          {busy ? "Création…" : submitLabel}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            « {created} » est enregistré, et visible partout où les terrains sont listés.
          </span>
        ) : null}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
