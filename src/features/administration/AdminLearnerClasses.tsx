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
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";

export function AdminLearnerClasses() {
  const { data, isPending } = useProgramAdmin();
  const [newLabel, setNewLabel] = useState("");

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const cohorts = sortCohortsForPilot(data.cohorts);
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
        Une classe appartient à un programme et à une période. Le programme, lui, reste réutilisable
        : ajouter une classe ne duplique jamais la structure pédagogique.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Classes du programme" value={cohorts.length} />
        <StatCard label="Classes en cours" value={running} />
        <StatCard label="Classes à venir" value={planned} />
        <StatCard label="Inscriptions actives" value={data.enrollments.length} />
      </div>

      <PanelCard
        title="Classes existantes"
        description="Chaque classe est pilotée séparément depuis « Structure du programme »."
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
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link to="/espace/administration/structure">Piloter cette classe</Link>
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
        description="Nouvelle promotion sur le même programme, sans dupliquer la pédagogie."
        action={<MockBadge />}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Promotion 2026-2027"
            aria-label="Intitulé de la nouvelle classe"
            className="min-h-11 sm:max-w-sm"
          />
          <Button className="min-h-11" disabled={newLabel.trim().length === 0}>
            Créer la classe (simulé)
          </Button>
        </div>
      </PanelCard>

      <CohortRosterSection data={data} />
    </div>
  );
}
