import { useQuery } from "@tanstack/react-query";
import { useDataAccess } from "@/application/session";
import { SectionHeading } from "@/components/section-heading";
import { AccessGrantSection } from "@/features/administration/AccessGrantSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { useSession } from "@/application/session";

export function AdminGovernance() {
  const { activeProgram } = useSession();
  const { data, isPending, error, refetch } = useProgramAdmin();
  const dataAccess = useDataAccess();
  // Les promotions archivées sont demandées à part : sans elles, un droit
  // accordé sur une promotion archivée s'afficherait « promotion inconnue ».
  const archivedQuery = useQuery({
    queryKey: ["cohorts-archived", activeProgram.id],
    queryFn: async () => {
      const all = await dataAccess.programs.listCohorts(activeProgram.id, {
        includeArchived: true,
      });
      return all.filter((c) => Boolean(c.archivedAt));
    },
  });

  if (isPending || !data) return <AdminChargement error={error} />;

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Administration et sécurité"
        level={1}
        description="Droits par programme, partage, conservation, audit et paramètres de sécurité."
      />

      <AccessGrantSection
        programId={activeProgram.id}
        people={data.people}
        cohorts={data.cohorts}
        archivedCohorts={archivedQuery.data ?? []}
        placements={data.placements}
        roleAssignments={data.roleAssignments}
        auditEvents={data.auditEvents}
        onGrantCreated={() => void refetch()}
      />
    </div>
  );
}
