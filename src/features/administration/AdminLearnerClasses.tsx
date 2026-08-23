/**
 * « Classes d'apprenants » — les promotions du programme.
 * Une classe est une cohorte : elle peut être créée manuellement ou importée,
 * et plusieurs classes peuvent vivre en parallèle sur le même programme.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortRosterSection } from "@/features/administration/CohortRosterSection";
import { LearnerTrackingSection } from "@/features/administration/LearnerTrackingSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";
import { CohortCreationForm } from "@/features/administration/CohortCreationForm";
import { useLocalCohorts } from "@/application/cohortDraftStore";
import { mergeCohorts } from "@/domain/cohortDraft";
import type { CurriculumVersionId } from "@/domain/types";

export function AdminLearnerClasses() {
  const { data, isPending } = useProgramAdmin();
  const localCohorts = useLocalCohorts(data?.program?.id);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const cohorts = sortCohortsForPilot(mergeCohorts(data.cohorts, localCohorts));
  const running = cohorts.filter((c) => cohortPhase(c) === "running").length;
  const planned = cohorts.filter((c) => cohortPhase(c) === "planned").length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Classes d'apprenants"
        level={1}
        action={<MockBadge />}
        description="Promotions du programme, effectifs, périodes et import des listes d'apprenants."
      />

      <ScopeNotice>
        Cet onglet est celui de la <strong>composition</strong> : qui est inscrit, dans quelle
        classe, sur quelle période, avec quels imports et quels archivages. L'avancement pédagogique
        et les relances ne se traitent pas ici mais dans « Pilotage de programme ».
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Classes du programme" value={cohorts.length} />
        <StatCard label="Classes en cours" value={running} />
        <StatCard label="Classes à venir" value={planned} />
        <StatCard label="Inscriptions actives" value={data.enrollments.length} />
      </div>

      <PanelCard
        title="Classes existantes"
        description="Composition de chaque classe. Le suivi de son avancement s'ouvre dans « Pilotage de programme »."
      >
        {cohorts.length === 0 ? (
          <EmptyState>Aucune classe rattachée à ce programme.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {cohorts.map((cohort) => {
              const enrolled = data.enrollments.filter((e) => e.cohortId === cohort.id).length;
              return (
                <li key={cohort.id} className="border-border space-y-2 rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{cohort.label}</span>
                    <Badge variant="outline" className="font-normal">
                      {COHORT_PHASE_LABELS_FR[cohortPhase(cohort)]}
                    </Badge>
                    <span className="text-muted-foreground text-sm">
                      {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      · {enrolled} inscription(s) sur {cohort.learnerCount} attendues
                    </span>
                  </div>
                  <Progress value={Math.round(cohortProgressRatio(cohort) * 100)} />
                  <div className="flex flex-wrap gap-2">
                    {/* Lien croisé : le suivi s'ouvre directement sur cette promotion. */}
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link
                        to="/espace/administration/pilotage"
                        search={{ promotion: cohort.id }}
                      >
                        Suivre cette promotion
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link to="/espace/administration/personnes">Gérer les personnes</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Créer une classe"
        description="Même outil que dans le « Concepteur de programme » : une classe créée ici y est immédiatement disponible pour association."
        action={<MockBadge />}
      >
        {data.program ? (
          <CohortCreationForm
            idPrefix="classes-cohort"
            programId={data.program.id}
            curriculumVersionId={
              data.versions[0]?.id ?? (`cv-${data.program.id}` as CurriculumVersionId)
            }
            submitLabel="Créer la classe"
            hint="Classe créée indépendamment d'une conception en cours : elle sera proposée dans le concepteur au moment d'associer une promotion."
          />
        ) : (
          <EmptyState>Sélectionnez un programme pour créer une classe.</EmptyState>
        )}
      </PanelCard>


      {/* Suivi croisé : même table que dans « Pilotage de programme ». */}
      <LearnerTrackingSection data={data} />

      <CohortRosterSection data={data} />
    </div>
  );
}
