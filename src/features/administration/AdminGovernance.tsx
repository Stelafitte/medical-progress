import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { EXPORT_NO_PATIENT_DATA_FR, RETENTION_TBD_FR } from "@/domain/administration";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { useSession } from "@/application/session";

export function AdminGovernance() {
  const { activeProgram } = useSession();
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const programRoles = data.roleAssignments.filter(
    (r) => "programId" in r.scope && r.scope.programId === activeProgram.id,
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Gouvernance"
        level={1}
        action={<MockBadge />}
        description="Droits par programme, partage, conservation, audit et paramètres de sécurité."
      />

      <ScopeNotice>
        Les droits sont contextualisés : aucun rôle global. L'administration plateforme n'hérite
        d'aucun accès aux dossiers pédagogiques de ce programme.
      </ScopeNotice>

      <PanelCard title="Droits par programme et périmètre">
        <ul className="space-y-1 text-sm">
          {programRoles.map((r, i) => (
            <li key={`${r.personId}-${r.role}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {data.people.find((p) => p.id === r.personId)?.fullName ?? r.personId}
              </span>
              <Badge variant="outline" className="font-normal">
                {ROLE_LABELS_FR[r.role]}
              </Badge>
              <span className="text-muted-foreground">portée : {r.scope.kind}</span>
            </li>
          ))}
          {programRoles.length === 0 ? (
            <li className="text-muted-foreground">Aucun rôle dans ce programme.</li>
          ) : null}
        </ul>
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
            Fragments photo : stockage privé prévu, jamais d'URL publique. Aucun stockage réel dans
            cette maquette.
          </li>
        </ul>
      </PanelCard>

      <PanelCard
        title="Journal d'audit simulé"
        description="Traçabilité prévue de chaque décision."
      >
        {data.auditEvents.length === 0 ? (
          <EmptyState>Aucun événement.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {data.auditEvents.map((e) => (
              <li key={e.id}>
                {new Date(e.createdAt).toLocaleDateString("fr-FR")} — {e.action}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Sécurité, confidentialité et rapports"
        description="Actions prévues, non actives dans cette maquette."
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
