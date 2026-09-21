/**
 * Bloc UNIQUE des droits d'un programme — même format que les évaluations et
 * les stages : droits existants → attribution d'un droit → règles de partage
 * et de conservation → journal d'audit.
 */
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { EmptyState, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { AccessGrantCreationForm } from "@/features/administration/AccessGrantCreationForm";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { grantsForProgram } from "@/domain/accessGrant";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { EXPORT_NO_PATIENT_DATA_FR, RETENTION_TBD_FR } from "@/domain/administration";
import type {
  AuditEvent,
  Cohort,
  Person,
  Placement,
  ProgramId,
  RoleAssignment,
} from "@/domain/types";

/** Libellés français des portées : aucune valeur technique à l'écran. */
const SCOPE_LABELS_FR: Record<string, string> = {
  platform: "plateforme",
  program: "tout le programme",
  cohort: "promotion",
  placement: "terrain de stage",
};

function scopeDetail(
  scope: RoleAssignment["scope"],
  cohorts: readonly Cohort[],
  placements: readonly Placement[],
): string {
  if (scope.kind === "cohort")
    return cohorts.find((c) => c.id === scope.cohortId)?.label ?? "promotion inconnue";
  if (scope.kind === "placement")
    return placements.find((p) => p.id === scope.placementId)?.name ?? "terrain inconnu";
  return SCOPE_LABELS_FR[scope.kind] ?? scope.kind;
}

export function AccessGrantSection({
  programId,
  people,
  cohorts,
  placements,
  roleAssignments,
  auditEvents,
  onGrantCreated,
}: {
  readonly programId: ProgramId;
  readonly people: readonly Person[];
  readonly cohorts: readonly Cohort[];
  readonly placements: readonly Placement[];
  readonly roleAssignments: readonly RoleAssignment[];
  readonly auditEvents: readonly AuditEvent[];
  readonly onGrantCreated?: (() => void) | undefined;
}) {
  const allGrants = grantsForProgram(roleAssignments, programId);
  const nameOf = (personId: string) => people.find((p) => p.id === personId)?.fullName ?? personId;

  return (
    <div className="space-y-8">
      <ScopeNotice>
        Les droits sont contextualisés : aucun rôle global. L'administration plateforme n'hérite
        d'aucun accès aux dossiers pédagogiques de ce programme.
      </ScopeNotice>

      <PanelCard
        title="Droits en place dans ce programme"
        description="Une personne, un rôle, une portée. Les droits accordés ici ne sortent jamais du programme."
      >
        {allGrants.length === 0 ? (
          <EmptyState>Aucun droit accordé dans ce programme.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {allGrants.map((grant, index) => (
              <li
                key={`${grant.personId}-${grant.role}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2"
              >
                <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-medium">{nameOf(grant.personId)}</span>
                <Badge variant="outline" className="font-normal">
                  {ROLE_LABELS_FR[grant.role]}
                </Badge>
                <span className="text-muted-foreground">
                  portée : {scopeDetail(grant.scope, cohorts, placements)}
                </span>
                <span className="ms-auto text-xs text-muted-foreground">
                  accordé le {formatFrDate(grant.grantedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Accorder un droit"
        description="La portée est obligatoire : programme, promotion ou terrain de stage. Le motif est journalisé."
      >
        <AccessGrantCreationForm
          programId={programId}
          people={people}
          cohorts={cohorts}
          placements={placements}
          existing={allGrants}
          onCreated={onGrantCreated}
        />
      </PanelCard>

      <PanelCard title="Partage, export et conservation">
        <ul className="space-y-2 text-sm">
          <li>{EXPORT_NO_PATIENT_DATA_FR}</li>
          <li>
            Durée de conservation des pièces et fragments photo :{" "}
            <Badge variant="outline" className="font-normal">
              {RETENTION_TBD_FR}
            </Badge>
          </li>
          <li>
            Pièces administratives et certificats : le référentiel des pièces exigées et le suivi
            des dépôts se règlent dans{" "}
            <Link className="underline" to="/espace/administration/documents">
              « Documents et certificats »
            </Link>
            . La signature du certificat de complétude revient au responsable de stage, jamais à
            l'administration.
          </li>
          <li>
            Fragments photo : stockage privé prévu, jamais d'URL publique. Aucun stockage réel à ce
            jour.
          </li>
        </ul>
      </PanelCard>

      <PanelCard
        title="Journal d'audit"
        description="Traçabilité de chaque décision : attribution de droit, validation, export."
      >
        {auditEvents.length === 0 ? (
          <EmptyState>
            Chaque attribution de droit est bien tracée en base, mais sa consultation à l'écran
            n'est pas encore disponible.
          </EmptyState>
        ) : (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {auditEvents.map((event) => (
              <li key={event.id}>
                {formatFrDate(event.createdAt)} — {event.action}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Sécurité, confidentialité et rapports"
        description="Actions prévues, pas encore actives."
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled>
            Exporter un rapport de conformité (prévu)
          </Button>
          <Button size="sm" variant="outline" disabled>
            Paramètres de confidentialité (prévu)
          </Button>
        </div>
      </PanelCard>
    </div>
  );
}
