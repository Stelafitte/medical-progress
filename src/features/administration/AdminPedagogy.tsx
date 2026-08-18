import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { MediaLibrarySection } from "@/features/administration/MediaLibrarySection";
import { EcosMigrationSection } from "@/features/administration/EcosMigrationSection";
import { ContentAiSection } from "@/features/administration/ContentAiSection";
import { NATURE_LABELS_FR } from "@/domain/mastery";

/** Sous-sections de la configuration pédagogique (ordre gelé). */
export const PEDAGOGY_TABS = [
  { value: "referentiels", label: "Référentiels" },
  { value: "objectifs", label: "Objectifs et compétences" },
  { value: "plans", label: "Plans et jalons" },
  { value: "carnets", label: "Carnets" },
  { value: "mediatheque", label: "Médiathèque" },
  { value: "ecos", label: "Évaluations et ECOS" },
] as const;

export function AdminPedagogy() {
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const byNature = (nature: string) => data.outcomes.filter((o) => o.nature === nature);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Configuration pédagogique"
        level={1}
        action={<MockBadge />}
        description="Référentiels, compétences simulées et réelles, plans d'acquisition, carnets, médiathèque et évaluations."
      />

      <ScopeNotice>
        Écran de configuration cloisonné sur <strong>{data.program?.name}</strong>. Le futur éditeur
        de contenus complet n'est pas reconstruit : la médiathèque et les ECOS sont des maquettes.
      </ScopeNotice>

      <Tabs defaultValue="referentiels" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {PEDAGOGY_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="min-h-11 flex-none text-xs sm:text-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="referentiels" className="space-y-6">
          <PanelCard
            title="Versions de curriculum"
            description="Une version de référentiel encadre les objectifs et les promotions."
          >
            {data.versions.length === 0 ? (
              <EmptyState>Aucune version de curriculum.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {data.versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{version.label}</span>
                    <Badge variant="outline" className="font-normal">
                      {version.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      en vigueur depuis{" "}
                      {new Date(version.effectiveFrom).toLocaleDateString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Règles de validation du programme"
            description="Une compétence réelle exige toujours un validateur humain."
          >
            <ul className="space-y-1">
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
              <li>
                Simulation : {data.program?.config.simulationEnabled ? "activée" : "désactivée"}
              </li>
            </ul>
          </PanelCard>
        </TabsContent>

        <TabsContent value="objectifs" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <PanelCard
            title="Plans d'acquisition et jalons"
            description="Calendrier officiel du programme."
          >
            {data.planSchedule.length === 0 ? (
              <EmptyState>Aucun jalon configuré.</EmptyState>
            ) : (
              <ul className="space-y-2">
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
        </TabsContent>

        <TabsContent value="carnets" className="space-y-6">
          <StageLogTemplatesSection />
        </TabsContent>

        <TabsContent value="mediatheque" className="space-y-6">
          <Tabs defaultValue="catalogue" className="space-y-6">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="catalogue" className="min-h-11 flex-none text-xs sm:text-sm">
                Catalogue
              </TabsTrigger>
              <TabsTrigger
                value="exploitation-ia"
                className="min-h-11 flex-none text-xs sm:text-sm"
              >
                Exploitation IA
              </TabsTrigger>
            </TabsList>
            <TabsContent value="catalogue" className="space-y-6">
              <MediaLibrarySection
                programName={data.program?.name ?? "ce programme"}
                media={data.media}
                outcomes={data.outcomes}
                people={data.people}
              />
            </TabsContent>
            <TabsContent value="exploitation-ia" className="space-y-6">
              <ContentAiSection
                programName={data.program?.name ?? "Programme"}
                media={data.media}
                profiles={data.aiProfiles}
                policy={data.aiPolicy}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="ecos" className="space-y-6">
          <EcosMigrationSection
            inventory={data.ecosInventory}
            scenarios={data.ecosScenarios}
            outcomes={data.outcomes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
