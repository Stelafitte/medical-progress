import { SectionHeading } from "@/components/section-heading";
import { MockBadge } from "@/features/professional/mock-ui";
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
        title="Administration et sécurité"
        level={1}
        action={<MockBadge />}
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
