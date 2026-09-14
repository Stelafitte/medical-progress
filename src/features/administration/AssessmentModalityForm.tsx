/**
 * Outil UNIQUE de création — et, depuis le 14/09 soir, de MODIFICATION — d'une
 * modalité d'évaluation. Avec `existing`, le formulaire part de la modalité et
 * enregistre en place ; sans, il crée. Un seul formulaire, deux verbes.
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
  SUBTYPE_GROUPS_FR,
  validateNewModality,
  type AssessmentMode,
  type AssessmentModality,
  type AssessmentSubtype,
  type AssessmentUsage,
  type NewAssessmentModalityInput,
} from "@/domain/assessmentModality";
import { useDataAccess } from "@/application/session";
import type { ProgramId } from "@/domain/types";

const SELECT_CLASS = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

function inputDepuis(existing: AssessmentModality | undefined): NewAssessmentModalityInput {
  if (!existing) return EMPTY_NEW_MODALITY_INPUT;
  return {
    name: existing.name,
    mode: existing.mode,
    subtype: existing.subtype,
    usage: existing.usage,
    notes: existing.notes ?? "",
  };
}

export function AssessmentModalityForm({
  programId,
  existing,
  submitLabel,
  hint,
  onCreated,
  idPrefix = "modality",
}: {
  readonly programId: ProgramId;
  /** Présente : on modifie cette modalité en place au lieu d'en créer une. */
  readonly existing?: AssessmentModality;
  readonly submitLabel?: string;
  readonly hint: string;
  /** Appelé avec la modalité créée OU modifiée. */
  readonly onCreated?: (created: AssessmentModality) => void;
  readonly idPrefix?: string;
}) {
  const dataAccess = useDataAccess();
  const libelleBouton =
    submitLabel ?? (existing ? "Enregistrer la modalité" : "Créer la modalité d'évaluation");
  const [input, setInput] = useState<NewAssessmentModalityInput>(() => inputDepuis(existing));
  const [showIssues, setShowIssues] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const issues = validateNewModality(input);
  const patch = (next: Partial<NewAssessmentModalityInput>) => {
    setInput((prev) => ({ ...prev, ...next }));
    setCreated(null);
  };

  /*
   * Changer le mode NE TOUCHE PLUS au sous-type (14/09).
   *
   * Tant que la base croisait les deux, passer en présentiel devait
   * réécrire le format, sans quoi l'insertion partait en erreur. La
   * contrainte est tombée : un ECOS reste un ECOS qu'il se passe au lit du
   * malade ou devant un écran, et reposer le format sous les doigts du
   * concepteur serait devenu une perte de saisie.
   */

  async function submit() {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const modality = existing
        ? await dataAccess.assessments.updateAssessmentModality({
            assessmentModalityId: existing.id,
            name: input.name,
            mode: input.mode,
            subtype: input.subtype,
            usage: input.usage,
            notes: input.notes,
          })
        : await dataAccess.assessments.createAssessmentModality({
            programId,
            name: input.name,
            mode: input.mode,
            subtype: input.subtype,
            usage: input.usage,
            notes: input.notes,
          });
      // En modification, le formulaire reste rempli : on continue d'éditer.
      if (!existing) setInput(EMPTY_NEW_MODALITY_INPUT);
      setShowIssues(false);
      setCreated(modality.name);
      onCreated?.(modality);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "Création de la modalité d'évaluation impossible.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
            onChange={(e) => patch({ mode: e.target.value as AssessmentMode })}
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
            {/*
              Groupé, pas filtré : les dix-huit formats sont TOUS proposés,
              quel que soit le mode. Les groupes ne sont qu'un ordre de
              lecture — voir SUBTYPE_GROUPS_FR.
            */}
            {SUBTYPE_GROUPS_FR.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.subtypes.map((subtype) => (
                  <option key={subtype} value={subtype}>
                    {ASSESSMENT_SUBTYPE_LABELS_FR[subtype]}
                  </option>
                ))}
              </optgroup>
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
          <Label>Date de passage</Label>
          {/*
            Dire ce que l'écran ne fait pas. « Dates » laissait croire à un
            champ désactivé ; il n'y a pas de champ du tout — une modalité dit
            COMMENT on évalue, jamais QUAND. Programmer une épreuve pour une
            promotion demande une table de sessions qui n'existe pas encore.
          */}
          <p className="text-muted-foreground border-border rounded-md border px-3 py-2.5 text-xs">
            Pas programmée ici : une modalité décrit le format, pas la séance. Seules la
            création et la mise à jour sont horodatées.
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

      {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="min-h-11"
          onClick={() => void submit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Enregistrement…" : libelleBouton}
        </Button>
        {created ? (
          <span className="text-muted-foreground text-sm">
            {existing ? `« ${created} » est enregistrée.` : `« ${created} » est ajoutée aux modalités du programme.`}
          </span>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
