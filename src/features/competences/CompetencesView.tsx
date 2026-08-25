/**
 * Mes compétences — vue apprenant indépendante du module stages.
 * Les compétences (simulées et réelles) existent même dans un programme sans
 * stage : cet écran est donc toujours accessible, tandis que le carnet de
 * stage reste conditionné au module stages du programme.
 */
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useSession } from "@/application/session";
import { MASTERY_LABELS_FR, NATURE_LABELS_FR, summarizeProgress } from "@/domain/mastery";
import type { OutcomeProgress } from "@/domain/mastery";

const NATURES = ["simulated_competence", "real_competence"] as const;

function CompetenceList({ items }: { items: readonly OutcomeProgress[] }) {
  if (items.length === 0) return <EmptyState>Aucune compétence de ce type dans ce programme.</EmptyState>;
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.outcome.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.outcome.label}</span>
            <Badge variant="outline" className="font-normal">
              {item.outcome.code}
            </Badge>
            <Badge variant={item.meetsTarget ? "default" : "outline"} className="font-normal">
              {MASTERY_LABELS_FR[item.mastery]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{item.outcome.description}</p>
          <Progress value={item.meetsTarget ? 100 : Math.min(90, item.countedEvidence.length * 25)} />
          <p className="text-xs text-muted-foreground">
            {item.countedEvidence.length} preuve(s) retenue(s) · {item.pendingEvidence.length} en
            attente · niveau cible : {MASTERY_LABELS_FR[item.outcome.targetMastery]}
          </p>
          {item.blockedBySelfDeclaration ? (
            <p className="text-xs text-warning">
              Auto-déclaration enregistrée : une validation par un tiers est nécessaire pour une
              compétence en situation réelle.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CompetencesView() {
  const { activeProgram, activeEnrollment } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const competences = data.progress.filter((p) => p.outcome.nature !== "knowledge");
  const summary = summarizeProgress(competences);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Mes compétences"
        level={1}
        action={<MockBadge label="Simulé" />}
        description={`${activeProgram.name} — compétences simulées et compétences en situation réelle.`}
      />

      <ScopeNotice>
        Une compétence en situation réelle n'est jamais acquise sur simple auto-déclaration : elle
        exige une validation humaine par un tiers habilité.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Compétences suivies" value={summary.total} />
        <StatCard label="Au niveau cible" value={`${summary.atTarget} (${summary.percentAtTarget} %)`} />
        <StatCard label="Non commencées" value={summary.notStarted} />
      </div>

      {NATURES.map((nature) => (
        <PanelCard
          key={nature}
          title={NATURE_LABELS_FR[nature]}
          description={
            nature === "real_competence"
              ? "Validées en situation clinique authentique par un encadrant."
              : "Travaillées en simulation, ECOS ou atelier encadré."
          }
        >
          <CompetenceList items={competences.filter((c) => c.outcome.nature === nature)} />
        </PanelCard>
      ))}
    </div>
  );
}
