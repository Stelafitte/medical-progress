import { BookOpen, Globe, PlayCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPlayerDuration } from "@/domain/mediaLibrary";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { ContentAiTutorPanel } from "@/features/resources/ContentAiTutorPanel";
import {
  AI_GROUNDING_NOTICE_FR,
  CITATION_KIND_LABELS_FR,
  AI_STUDY_CTA_FR,
  WEB_REFERENCE_CTA_FR,
} from "@/domain/contentAi";
import { MEDIA_KIND_LABELS_FR } from "@/domain/mediaLibrary";

const FORMAT_FR: Record<string, string> = {
  course: "Cours",
  video: "Vidéo",
  quiz: "QCM",
  checklist: "Grille",
  reference: "Référence",
};

export function ResourcesView() {
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const { resources, outcomes, narratedDecks, aiResources } = data;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Ressources"
        level={1}
        action={
          <Badge variant="outline" className="font-normal">
            Simulé
          </Badge>
        }
        description="Contenus rattachés aux acquis du référentiel du programme actif."
      />

      <p className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        Catalogue simulé : les ressources proviennent des repositories mock. La lecture réelle des
        contenus et le suivi de consultation sont prévus après validation du schéma de données.
      </p>

      {narratedDecks.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            title="Diaporamas commentés"
            level={2}
            description="Lecture en ligne synchronisée : diapositives, commentaire audio, sommaire et transcription. Le fichier PowerPoint source n'est pas distribué."
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {narratedDecks.map((deck) => (
              <li key={deck.mediaId}>
                <Card className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <PlayCircle className="size-4 text-primary" aria-hidden />
                      <Badge variant="outline" className="font-normal">
                        Diaporama commenté
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{deck.title}</CardTitle>
                    <CardDescription>
                      {deck.module} · {deck.slideCount} diapositives ·{" "}
                      {formatPlayerDuration(deck.totalDurationSeconds)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button asChild className="min-h-11 w-full gap-2 sm:w-auto">
                      <Link
                        to="/espace/ressources/$resourceId/lecture"
                        params={{ resourceId: deck.mediaId }}
                      >
                        <PlayCircle className="size-4" aria-hidden />
                        Consulter le cours
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {aiResources.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            title={AI_STUDY_CTA_FR}
            level={2}
            description="Chaque support validé peut être interrogé, transformé en QCM, en cas clinique guidé ou en révision adaptative. Les réponses sont maquettées et citent leur référence dans le contenu validé."
          />
          <p className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            {AI_GROUNDING_NOTICE_FR}. Aucun traitement IA réel n'est effectué dans cette maquette.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {aiResources.map((item) => (
              <li key={item.mediaId}>
                <Card className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.kind === "web_page" ? (
                        <Globe className="size-4 text-primary" aria-hidden />
                      ) : (
                        <BookOpen className="size-4 text-primary" aria-hidden />
                      )}
                      <Badge variant="outline" className="font-normal">
                        {MEDIA_KIND_LABELS_FR[item.kind]}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {item.sourceVersion}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.module}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Références citables :{" "}
                      {item.citations.length > 0
                        ? `${CITATION_KIND_LABELS_FR[item.citations[0]!.kind]} — ${item.citations
                            .map((c) => c.locator)
                            .join(" · ")}`
                        : "aucune"}
                      .
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {item.canonicalUrl ? (
                        <Button
                          asChild
                          variant="secondary"
                          className="min-h-11 w-full gap-2 sm:w-auto"
                        >
                          <a href={item.canonicalUrl} target="_blank" rel="noreferrer noopener">
                            <Globe className="size-4" aria-hidden />
                            {WEB_REFERENCE_CTA_FR}
                          </a>
                        </Button>
                      ) : null}
                      {item.hasNarratedPlayer ? (
                        <Button asChild className="min-h-11 w-full gap-2 sm:w-auto">
                          <Link
                            to="/espace/ressources/$resourceId/lecture"
                            params={{ resourceId: item.mediaId }}
                          >
                            <PlayCircle className="size-4" aria-hidden />
                            Consulter le cours
                          </Link>
                        </Button>
                      ) : null}
                      <ContentAiTutorPanel resource={item} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" aria-hidden />
                  <Badge variant="outline" className="font-normal">
                    {FORMAT_FR[resource.format] ?? resource.format}
                  </Badge>
                </div>
                <CardTitle className="text-base">{resource.title}</CardTitle>
                <CardDescription>≈ {resource.estimatedMinutes} min</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {resource.outcomeIds.map((id) => {
                    const outcome = outcomes.find((o) => o.id === id);
                    return (
                      <li key={id}>
                        <Badge variant="secondary" className="font-normal">
                          {outcome ? `${outcome.code} · ${outcome.label}` : id}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
        {resources.length === 0 ? (
          <li className="text-sm text-muted-foreground">Aucune ressource pour ce programme.</li>
        ) : null}
      </ul>
    </div>
  );
}
