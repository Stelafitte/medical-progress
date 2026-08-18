import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { CohortRosterSection } from "@/features/administration/CohortRosterSection";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { useSession } from "@/application/session";

const STATUS_FR: Record<string, string> = {
  planned: "à venir",
  in_progress: "en cours",
  completed: "terminé",
  cancelled: "annulé",
};

export function AdminOrganisation() {
  const { activeProgram } = useSession();
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const scopedRoles = data.roleAssignments.filter(
    (r) =>
      r.scope.kind !== "platform" &&
      "programId" in r.scope &&
      r.scope.programId === activeProgram.id,
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Organisation"
        level={1}
        action={<MockBadge />}
        description="Cursus, promotions, utilisateurs, rôles contextualisés, terrains et affectations."
      />

      <ScopeNotice>
        Toutes les listes ci-dessous sont filtrées sur {activeProgram.name}. Les invitations et
        modifications sont des démonstrations : rien n'est enregistré.
      </ScopeNotice>

      <PanelCard
        title="Programme, modules et versions de cursus"
        description={`${activeProgram.institution} · ≈ ${activeProgram.annualLearnerEstimate} apprenants/an`}
      >
        <ul className="space-y-2">
          {data.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{v.label}</span>
              <Badge variant="outline" className="font-normal">
                {v.status === "active" ? "active" : v.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                en vigueur le {new Date(v.effectiveFrom).toLocaleDateString("fr-FR")}
              </span>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title="Promotions, cohortes et groupes">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohorte</TableHead>
                <TableHead>Année</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">Apprenants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cohorts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell>{c.academicYear}</TableCell>
                  <TableCell>
                    {new Date(c.startsOn).toLocaleDateString("fr-FR")} —{" "}
                    {new Date(c.endsOn).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right">{c.learnerCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard
        title="Utilisateurs et rôles contextualisés"
        description="Étudiants, enseignants et responsables de stage rattachés à ce programme."
        action={
          <Button size="sm" variant="outline" disabled>
            Inviter (démonstration)
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personne</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Portée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopedRoles.map((r, index) => (
                <TableRow key={`${r.personId}-${r.role}-${index}`}>
                  <TableCell className="font-medium">
                    {data.people.find((p) => p.id === r.personId)?.fullName ?? r.personId}
                  </TableCell>
                  <TableCell>{ROLE_LABELS_FR[r.role]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.scope.kind === "program"
                      ? "programme"
                      : r.scope.kind === "cohort"
                        ? "cohorte"
                        : "stage"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {scopedRoles.length === 0 ? <EmptyState>Aucun rôle dans ce programme.</EmptyState> : null}
      </PanelCard>

      <PanelCard title="Terrains de stage, capacités et périodes">
        <ul className="space-y-2">
          {data.placements.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-muted-foreground">
                {p.site} · {p.department} · capacité {p.capacity}
              </span>
            </li>
          ))}
          {data.placements.length === 0 ? (
            <li className="text-sm text-muted-foreground">Aucun terrain configuré.</li>
          ) : null}
        </ul>
      </PanelCard>

      <PanelCard
        title="Affectations étudiants ↔ stages"
        description="Les changements seront historisés (journal d'audit) lors de l'activation du backend."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Étudiant</TableHead>
                <TableHead>Terrain</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {personNameFor(data, a.enrollmentId)}
                  </TableCell>
                  <TableCell>
                    {data.placements.find((p) => p.id === a.placementId)?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {data.people.find((p) => p.id === a.supervisorPersonId)?.fullName ?? "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(a.startsOn).toLocaleDateString("fr-FR")} —{" "}
                    {new Date(a.endsOn).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {STATUS_FR[a.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>
    </div>
  );
}
