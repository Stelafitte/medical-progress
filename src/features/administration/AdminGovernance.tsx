import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { MockBadge } from "@/features/professional/mock-ui";
import { AccessGrantSection } from "@/features/administration/AccessGrantSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { useSession } from "@/application/session";

export function AdminGovernance() {
  const { activeProgram } = useSession();
  const { data, isPending, refetch } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

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
