/**
 * « Évaluations » — flux linéaire, sans onglets :
 * modalités existantes → création d'une modalité → import de résultats externes
 * → résultats par cohorte (réalisés et à venir).
 */
import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { MockBadge, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { AssessmentModalitySection } from "@/features/administration/AssessmentModalitySection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import { useLocalModalities } from "@/application/assessmentModalityStore";
import { mergeModalities } from "@/domain/assessmentModality";
import { modalityFixturesFor } from "@/infrastructure/mock/assessmentModalityFixtures";

export function AdminAssessments() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const local = useLocalModalities(data?.program?.id);

  if (isPending || !data || !data.program) return <Skeleton className="h-80 w-full" />;

  const program = data.program;
  const cohorts = data.cohorts;
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const modalities = mergeModalities(modalityFixturesFor(program.id), local);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Évaluations"
        level={1}
        action={<MockBadge />}
        description="Modalités d'évaluation du programme, création d'une modalité, import des résultats obtenus hors plateforme et résultats par cohorte."
      />

      <ScopeNotice>
        Une évaluation peut se dérouler en présentiel ou en ligne. Les mêmes éléments sont
        disponibles dans la partie Évaluation du pilotage de programme. Aucun résultat n'est
        enregistré dans cette maquette.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Modalités d'évaluation" value={modalities.length} />
        <StatCard
          label="Modalités en ligne"
          value={modalities.filter((m) => m.mode === "online").length}
        />
        <StatCard label="Cohortes concernées" value={cohorts.length} />
        <StatCard label="Objectifs évaluables" value={data.outcomes.length} />
      </div>

      <AssessmentModalitySection
        programId={program.id}
        cohorts={cohorts}
        cohortId={selectedId}
        onCohortChange={setCohortId}
      />
    </div>
  );
}
