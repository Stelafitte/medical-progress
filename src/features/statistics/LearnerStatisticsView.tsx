/**
 * Mes statistiques — chiffres personnels de l'apprenant, extraits du passeport.
 * Aucun calcul comparatif avec les autres apprenants : le périmètre reste
 * strictement individuel.
 */
import { SectionHeading } from "@/components/section-heading";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useSession } from "@/application/session";
import { NATURE_LABELS_FR, summarizeProgress } from "@/domain/mastery";
import type { OutcomeNature } from "@/domain/types";

const NATURES: readonly OutcomeNature[] = [
  "knowledge",
  "simulated_competence",
  "real_competence",
];

export function LearnerStatisticsView() {
  const { activeProgram, activeEnrollment } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const { progress, evidence, summary, plan } = data;
  const validated = evidence.filter((e) => e.status === "validated").length;
  const pending = evidence.filter((e) => e.status === "submitted" || e.status === "draft").length;
  const late = plan.items.filter((item) => item.stage !== "acquired").length;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Mes statistiques"
        level={1}
        action={<MockBadge label="Simulé" />}
        description={`${activeProgram.name} — ma progression chiffrée, à mon seul périmètre.`}
      />

      <ScopeNotice>
        Ces chiffres décrivent uniquement votre parcours. Aucun classement ni comparaison avec les
        autres apprenants n'est produit.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Acquis au niveau cible" value={`${summary.percentAtTarget} %`} hint={`${summary.atTarget} / ${summary.total}`} />
        <StatCard label="Preuves validées" value={validated} />
        <StatCard label="Preuves en attente" value={pending} />
        <StatCard label="Jalons restants" value={late} />
      </div>

      <PanelCard title="Progression par nature d'acquis" description="Connaissances, compétences simulées et compétences réelles.">
        {progress.length === 0 ? (
          <EmptyState>Aucun acquis configuré dans ce programme.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {NATURES.map((nature) => {
              const items = progress.filter((p) => p.outcome.nature === nature);
              const natureSummary = summarizeProgress(items);
              return (
                <li key={nature} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{NATURE_LABELS_FR[nature]}</span>
                    <span className="text-sm text-muted-foreground">
                      {natureSummary.atTarget} / {natureSummary.total} ·{" "}
                      {natureSummary.percentAtTarget} %
                    </span>
                  </div>
                  <Progress value={natureSummary.percentAtTarget} />
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
