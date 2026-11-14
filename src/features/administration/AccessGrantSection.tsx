/**
 * Bloc UNIQUE des droits d'un programme — même format que les évaluations et
 * les stages : droits existants → attribution d'un droit → règles de partage
 * et de conservation → journal d'audit.
 */
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { EmptyState, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { AccessGrantCreationForm } from "@/features/administration/AccessGrantCreationForm";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { horodatageFr, libelleEvenement } from "@/domain/auditJournal";
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
  archivedCohorts: readonly Cohort[] = [],
): string {
  if (scope.kind === "cohort") {
    const active = cohorts.find((c) => c.id === scope.cohortId);
    if (active) return active.label;
    const archived = archivedCohorts.find((c) => c.id === scope.cohortId);
    return archived ? `${archived.label} (archivée)` : "promotion inconnue";
  }
  if (scope.kind === "placement")
    return placements.find((p) => p.id === scope.placementId)?.name ?? "terrain inconnu";
  return SCOPE_LABELS_FR[scope.kind] ?? scope.kind;
}

/** Ordre d'affichage des fonctions : du plus large au plus ciblé. */
const ROLE_ORDER: readonly RoleAssignment["role"][] = [
  "administrator",
  "teacher",
  "placement_manager",
  "placement_supervisor",
  "learner",
];

export function AccessGrantSection({
  programId,
  people,
  cohorts,
  placements,
  roleAssignments,
  auditEvents,
  archivedCohorts = [],
  onGrantCreated,
}: {
  readonly programId: ProgramId;
  readonly people: readonly Person[];
  readonly cohorts: readonly Cohort[];
  readonly placements: readonly Placement[];
  readonly roleAssignments: readonly RoleAssignment[];
  readonly auditEvents: readonly AuditEvent[];
  /** Promotions archivées : elles restent nommées dans la liste des droits. */
  readonly archivedCohorts?: readonly Cohort[] | undefined;
  readonly onGrantCreated?: (() => void) | undefined;
}) {
  const allGrants = grantsForProgram(roleAssignments, programId);
  const nameOf = (personId: string) => people.find((p) => p.id === personId)?.fullName ?? personId;
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  const rows = allGrants.map((grant) => ({
    grant,
    name: nameOf(grant.personId),
    scopeLabel: scopeDetail(grant.scope, cohorts, placements, archivedCohorts),
  }));
  const scopeOptions = [...new Set(rows.map((r) => r.scopeLabel))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const visibles = rows.filter(
    (r) =>
      (roleFilter === "all" || r.grant.role === roleFilter) &&
      (scopeFilter === "all" || r.scopeLabel === scopeFilter),
  );
  const groups = ROLE_ORDER.map((role) => ({
    role,
    items: visibles
      .filter((r) => r.grant.role === role)
      .sort(
        (a, b) =>
          a.scopeLabel.localeCompare(b.scopeLabel, "fr") || a.name.localeCompare(b.name, "fr"),
      ),
  })).filter((g) => g.items.length > 0);

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
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Fonction</span>
                <select
                  className="min-h-9 rounded-md border bg-background px-2"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">Toutes les fonctions</option>
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS_FR[role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Portée</span>
                <select
                  className="min-h-9 rounded-md border bg-background px-2"
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                >
                  <option value="all">Toutes les portées</option>
                  {scopeOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {groups.length === 0 ? (
              <EmptyState>Aucun droit ne correspond à ce filtre.</EmptyState>
            ) : null}
            {groups.map(({ role, items }) => (
              <section key={role} aria-label={ROLE_LABELS_FR[role]} className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {ROLE_LABELS_FR[role]}{" "}
                  <span className="font-normal text-muted-foreground">({items.length})</span>
                </h3>
                <ul className="space-y-2 text-sm">
                  {items.map(({ grant, name, scopeLabel }, index) => (
                    <li
                      key={`${grant.personId}-${grant.role}-${scopeLabel}-${index}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                    >
                      <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">portée : {scopeLabel}</span>
                      <span className="ms-auto text-xs text-muted-foreground">
                        accordé le {formatFrDate(grant.grantedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
        description="Les 50 dernières décisions tracées en base pour ce programme : droits accordés, promotions, versions du référentiel, acquis modifiés."
      >
        {auditEvents.length === 0 ? (
          <EmptyState>Aucune décision tracée pour ce programme.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {auditEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {horodatageFr(event.createdAt)}
                </span>
                <span className="font-medium">{libelleEvenement(event.action)}</span>
                <span className="text-muted-foreground text-xs">
                  par {event.actorName ?? (event.actorPersonId === "system" ? "le système" : "—")}
                </span>
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
