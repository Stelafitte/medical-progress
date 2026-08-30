/**
 * Outil UNIQUE d'attribution d'un droit contextualisé dans un programme.
 * Aucune portée plateforme, aucun rôle global : la portée est toujours choisie.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataAccess } from "@/application/session";
import {
  buildScopeFromInput,
  scopeIdFromScope,
  EMPTY_NEW_ACCESS_GRANT_INPUT,
  GRANTABLE_ROLES,
  GRANT_SCOPE_LABELS_FR,
  NEW_ACCESS_GRANT_ISSUE_LABELS_FR,
  validateNewAccessGrant,
  type GrantScopeKind,
  type GrantableRole,
  type NewAccessGrantInput,
} from "@/domain/accessGrant";
import { ROLE_LABELS_FR } from "@/domain/roles";
import type {
  Cohort,
  Person,
  Placement,
  PersonId,
  ProgramId,
  RoleAssignment,
} from "@/domain/types";

export function AccessGrantCreationForm({
  programId,
  people,
  cohorts,
  placements,
  existing,
  onCreated,
}: {
  readonly programId: ProgramId;
  readonly people: readonly Person[];
  readonly cohorts: readonly Cohort[];
  readonly placements: readonly Placement[];
  readonly existing: readonly RoleAssignment[];
  readonly onCreated?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [input, setInput] = useState<NewAccessGrantInput>(EMPTY_NEW_ACCESS_GRANT_INPUT);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const issues = validateNewAccessGrant(input, { programId, existing });
  const patch = (next: Partial<NewAccessGrantInput>) => setInput((prev) => ({ ...prev, ...next }));

  async function submit() {
    setSubmitted(true);
    if (issues.length > 0) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const scope = buildScopeFromInput(input, programId);
      await dataAccess.administration.grantRoleAssignment({
        personId: input.personId as PersonId,
        role: input.role,
        scopeKind: input.scopeKind,
        scopeId: scopeIdFromScope(scope),
        programId,
        justification: input.justification.trim(),
      });
      setInput(EMPTY_NEW_ACCESS_GRANT_INPUT);
      setSubmitted(false);
      onCreated?.();
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "Attribution du droit impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Personne</Label>
          <Select value={input.personId} onValueChange={(v) => patch({ personId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une personne" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Rôle accordé</Label>
          <Select value={input.role} onValueChange={(v) => patch({ role: v as GrantableRole })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANTABLE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS_FR[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Portée du droit</Label>
          <Select
            value={input.scopeKind}
            onValueChange={(v) => patch({ scopeKind: v as GrantScopeKind })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GRANT_SCOPE_LABELS_FR) as GrantScopeKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {GRANT_SCOPE_LABELS_FR[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {input.scopeKind === "cohort" ? (
          <div className="space-y-2">
            <Label>Promotion concernée</Label>
            <Select value={input.cohortId} onValueChange={(v) => patch({ cohortId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une promotion" />
              </SelectTrigger>
              <SelectContent>
                {cohorts.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {input.scopeKind === "placement" ? (
          <div className="space-y-2">
            <Label>Terrain de stage concerné</Label>
            <Select value={input.placementId} onValueChange={(v) => patch({ placementId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un terrain" />
              </SelectTrigger>
              <SelectContent>
                {placements.map((placement) => (
                  <SelectItem key={placement.id} value={placement.id}>
                    {placement.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="grant-justification">Motif de l'attribution (journalisé)</Label>
        <Textarea
          id="grant-justification"
          value={input.justification}
          onChange={(event) => patch({ justification: event.target.value })}
          placeholder="Ex. encadrement du terrain de cardiologie pour la promotion 2026."
        />
      </div>

      {submitted && issues.length > 0 ? (
        <ul className="space-y-1 text-sm text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{NEW_ACCESS_GRANT_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <Button size="sm" onClick={() => void submit()} disabled={isSubmitting}>
        {isSubmitting ? "Attribution en cours…" : "Accorder ce droit"}
      </Button>
    </div>
  );
}
