import { BookOpen, PlayCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPlayerDuration } from "@/domain/mediaLibrary";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";

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

  const { resources, outcomes, narratedDecks } = data;

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
