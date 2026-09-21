/**
 * « Gestion des stages » — la page, dans l'ordre où on la lit : terrains et
 * création, promotions concernées affichées d'emblée, encadrement de la
 * promotion choisie, apprenants rattachés, suivi construit sur les carnets
 * réels, et en dernier les éléments de validation, seule partie encore en
 * maquette.
 *
 * L'écriture est REELLE depuis le 07/09 : terrain, groupe d'encadrement,
 * membres, encadrants et ouverture des carnets passent tous par les fonctions
 * serveur de la migration 20260831093000.
 */
import { SectionHeading } from "@/components/section-heading";
import { ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { PlacementSection } from "@/features/administration/PlacementSection";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { SupervisionGroupSection } from "@/features/administration/SupervisionGroupSection";
import { SupervisionWeeksSection } from "@/features/administration/SupervisionWeeksSection";
import type { ProgramId } from "@/domain/types";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";

export function AdminStages() {
  const { data, isPending, error, refetch } = useProgramAdmin();
  // 21/09 : la promotion est celle du menu d'en-tête, partagée par tous les onglets.
  const cohortId = useCohortFocus();

  if (isPending || !data) return <AdminChargement error={error} />;

  const placements = data.placements;
  const sites = Array.from(new Set(placements.map((p) => p.site)));
  const capacity = placements.reduce((total, p) => total + p.capacity, 0);
  const programId = (data.program?.id ?? "program-unknown") as ProgramId;
  const selectedId = cohortId ?? defaultPilotCohortId(data.cohorts);
  const attached = data.groups.reduce(
    (total, group) => total + group.memberEnrollmentIds.length,
    0,
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={data.program?.name ?? "Programme"}
        title="Gestion des stages"
        level={1}
        description="Terrains de stage, promotions concernées, encadrement, et suivi des carnets."
      />

      <ScopeNotice>
        Un programme peut compter plusieurs promotions : l'encadrement et le suivi se lisent
        promotion par promotion. Les mêmes éléments sont disponibles dans la partie Stages du
        pilotage de programme.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Terrains de stage" value={placements.length} />
        <StatCard label="Lieux distincts" value={sites.length} />
        <StatCard label="Places totales" value={capacity} />
        <StatCard label="Apprenants rattachés" value={attached} />
      </div>

      <PlacementSection
        programId={programId}
        programName={data.program?.name ?? "ce programme"}
        placements={placements}
        enrollments={data.enrollments}
        people={data.people}
        cohorts={data.cohorts}
        groups={data.groups}
        stageLogs={data.stageLogs}
        templates={data.templates}
        cohortId={selectedId}
        onCohortChange={setCohortFocus}
        onChanged={() => void refetch()}
        supervisionSlot={
          <SupervisionGroupSection
            programId={programId}
            cohorts={data.cohorts}
            cohortId={selectedId ?? ""}
            placements={placements}
            enrollments={data.enrollments}
            people={data.people}
            pendingPeople={data.pendingPeople}
            roleAssignments={data.roleAssignments}
            groups={data.groups}
            stageLogs={data.stageLogs}
            onChanged={() => void refetch()}
          />
        }
      />

      <SupervisionWeeksSection
        programId={programId}
        cohorts={data.cohorts}
        cohortId={selectedId ?? ""}
        groups={data.groups}
      />

      <StageLogTemplatesSection />
    </div>
  );
}
