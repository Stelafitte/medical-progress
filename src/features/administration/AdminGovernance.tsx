import { SectionHeading } from "@/components/section-heading";
import { AccessGrantSection } from "@/features/administration/AccessGrantSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { useSession } from "@/application/session";

export function AdminGovernance() {
  const { activeProgram } = useSession();
  const { data, isPending, error, refetch } = useProgramAdmin();

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
        placements={data.placements}
        roleAssignments={data.roleAssignments}
        auditEvents={data.auditEvents}
        onGrantCreated={() => void refetch()}
      />
    </div>
  );
}
