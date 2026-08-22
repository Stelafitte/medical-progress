/**
 * « Base de connaissances » — tout le savoir théorique du programme :
 * dépôt des supports, conversion HTML5 des PowerPoint sonorisés,
 * prévisualisation apprenant et exploitation IA.
 */
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { MediaLibrarySection } from "@/features/administration/MediaLibrarySection";
import { ContentAiSection } from "@/features/administration/ContentAiSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { NATURE_LABELS_FR } from "@/domain/mastery";

export function AdminKnowledgeBase() {
  const { data, isPending } = useProgramAdmin();

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const knowledge = data.outcomes.filter((o) => o.nature === "knowledge");
  const published = data.media.filter((m) => m.status === "published").length;
  const narrated = data.media.filter((m) => m.kind === "slides_audio").length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Base de connaissances"
        level={1}
        action={<MockBadge />}
        description="Supports théoriques, conversion HTML5 des diaporamas sonorisés et exploitation IA des contenus publiés."
      />

      <ScopeNotice>
        Les supports appartiennent au programme, jamais à une cohorte : une cohorte ultérieure
        réutilise la même base de connaissances. Aucun fichier n'est stocké dans cette maquette.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Supports du programme" value={data.media.length} />
        <StatCard label="Supports publiés" value={published} />
        <StatCard label="Diaporamas sonorisés" value={narrated} />
        <StatCard label={NATURE_LABELS_FR.knowledge} value={knowledge.length} />
      </div>

      <Tabs defaultValue="catalogue" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="catalogue" className="min-h-11 flex-none text-xs sm:text-sm">
            Dépôt et catalogue
          </TabsTrigger>
          <TabsTrigger value="objectifs" className="min-h-11 flex-none text-xs sm:text-sm">
            Connaissances visées
          </TabsTrigger>
          <TabsTrigger value="ia" className="min-h-11 flex-none text-xs sm:text-sm">
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

        <TabsContent value="objectifs" className="space-y-6">
          <PanelCard
            title="Connaissances visées par le programme"
            description="Chaque support peut être rattaché à une ou plusieurs connaissances."
          >
            <ul className="space-y-1 text-sm">
              {knowledge.map((outcome) => (
                <li key={outcome.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground font-mono text-xs">{outcome.code}</span>
                  <span>{outcome.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {data.media.filter((m) => m.outcomeIds.includes(outcome.id)).length} support(s)
                  </span>
                </li>
              ))}
              {knowledge.length === 0 ? (
                <li className="text-muted-foreground">Aucune connaissance définie.</li>
              ) : null}
            </ul>
          </PanelCard>
        </TabsContent>

        <TabsContent value="ia" className="space-y-6">
          <ContentAiSection
            programName={data.program?.name ?? "Programme"}
            media={data.media}
            profiles={data.aiProfiles}
            policy={data.aiPolicy}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
