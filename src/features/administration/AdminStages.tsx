/**
 * « Gestion des stages » — flux linéaire, même format que « Évaluations » :
 * stages existants et leur responsable → création d'un terrain → éléments de
 * validation (certificat au responsable, carnet de stage) → association aux
 * apprenants d'une cohorte → suivi des stages et de leurs étapes de validation.
 * Maquette : aucune écriture réelle.
 */
import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { MockBadge, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { PlacementSection } from "@/features/administration/PlacementSection";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { mergePlacements } from "@/domain/placementDraft";
import type { ProgramId } from "@/domain/types";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";

export function AdminStages() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const localPlacements = useLocalPlacements(data?.program?.id);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  /** Liste UNIQUE des terrains : ceux du dépôt et ceux créés dans la session. */
  const placements = mergePlacements(data.placements, localPlacements);
  const sites = Array.from(new Set(placements.map((p) => p.site)));
  const capacity = placements.reduce((total, p) => total + p.capacity, 0);
  const programId = (data.program?.id ?? "program-unknown") as ProgramId;
  const selectedId = cohortId ?? defaultPilotCohortId(data.cohorts);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Gestion des stages"
        level={1}
        action={<MockBadge />}
        description="Stages du programme et leurs responsables, création d'un terrain, éléments de validation, association aux apprenants d'une cohorte et suivi des stages."
      />

      <ScopeNotice>
        Un programme peut compter plusieurs cohortes : les associations et le suivi se lisent
        cohorte par cohorte. Les mêmes éléments sont disponibles dans la partie Stages du pilotage
        de programme. Rien n'est enregistré dans cette maquette.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Terrains de stage" value={placements.length} />
        <StatCard label="Lieux distincts" value={sites.length} />
        <StatCard label="Places totales" value={capacity} />
        <StatCard label="Affectations connues" value={data.assignments.length} />
      </div>

      <PlacementSection
        programId={programId}
        programName={data.program?.name ?? "ce programme"}
        placements={placements}
        localPlacements={localPlacements}
        assignments={data.assignments}
        enrollments={data.enrollments}
        people={data.people}
        cohorts={data.cohorts}
        templates={data.templates}
        competencesExpected={Math.max(
          1,
          data.outcomes.filter((outcome) => outcome.nature === "real_competence").length,
        )}
        cohortId={selectedId}
        onCohortChange={setCohortId}
      />

      <StageLogTemplatesSection />
    </div>
  );
}
