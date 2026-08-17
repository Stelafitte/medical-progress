import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { NATURE_LABELS_FR } from "@/domain/mastery";

export function AdminPedagogy() {
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const byNature = (nature: string) => data.outcomes.filter((o) => o.nature === nature);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Configuration pédagogique"
        level={1}
        action={<MockBadge />}
        description="Référentiels, compétences simulées et réelles, plans d'acquisition, carnets et ressources."
      />

      <ScopeNotice>
        Vues de configuration en lecture : le futur éditeur de contenus (CMS, QCM, ECOS) n'est pas
        reconstruit dans cette maquette.
      </ScopeNotice>

      <div className="grid gap-4 md:grid-cols-3">
        {(["knowledge", "simulated_competence", "real_competence"] as const).map((nature) => (
          <PanelCard
            key={nature}
            title={NATURE_LABELS_FR[nature]}
            description={`${byNature(nature).length} acquis configuré(s)`}
          >
            <ul className="space-y-1 text-sm">
              {byNature(nature).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {o.code}
                  </Badge>
                  <span>{o.label}</span>
                </li>
              ))}
              {byNature(nature).length === 0 ? (
                <li className="text-muted-foreground">Aucun acquis.</li>
              ) : null}
            </ul>
          </PanelCard>
        ))}
      </div>

      <PanelCard
        title="Objectifs obligatoires, prérequis et règles de validation"
        description="Une compétence réelle exige toujours un validateur humain."
      >
        <ul className="space-y-1 text-sm">
          <li>
            Maîtrise cible du programme :{" "}
            <strong>{data.program?.config.targetMastery ?? "—"}</strong>
          </li>
          <li>
            Validation humaine obligatoire :{" "}
            <strong>
              {data.program?.config.realCompetenceRequiresValidator ? "activée" : "désactivée"}
            </strong>
          </li>
          <li>Stages : {data.program?.config.placementsEnabled ? "activés" : "désactivés"}</li>
          <li>Simulation : {data.program?.config.simulationEnabled ? "activée" : "désactivée"}</li>
        </ul>
      </PanelCard>

      <PanelCard
        title="Plans d'acquisition et jalons"
        description="Calendrier officiel du programme."
      >
        {data.planSchedule.length === 0 ? (
          <EmptyState>Aucun jalon configuré.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.planSchedule.map((entry) => (
              <li
                key={`${entry.outcomeId}-${entry.dueOn}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-medium">{entry.milestoneLabel}</span>
                <Badge variant="outline" className="font-normal">
                  {entry.official ? "officiel" : "indicatif"}
                </Badge>
                <span className="text-muted-foreground">
                  échéance {new Date(entry.dueOn).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <StageLogTemplatesSection />

      <PanelCard
        title="Ressources, QCM et documents obligatoires"
        description="Vue mock : aucun contenu réel n'est stocké."
      >
        <ul className="space-y-1 text-sm">
          {data.resources.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span>{r.title}</span>
              <Badge variant="outline" className="font-normal">
                {r.format}
              </Badge>
            </li>
          ))}
          {data.resources.length === 0 ? (
            <li className="text-muted-foreground">Aucune ressource.</li>
          ) : null}
        </ul>
      </PanelCard>
    </div>
  );
}
