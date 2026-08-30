/**
 * Écran de lecture dédié d'un diaporama commenté (apprenant).
 * Contrat : la vue ne reçoit qu'un DTO d'artefacts dérivés
 * (`LearnerNarratedDeck`). Aucun nom de fichier, URL, taille, MP4 de secours
 * ni action relative au PPTX source n'y est disponible. Tout est simulé.
 */
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { NarratedSlidesPlayer } from "@/features/resources/NarratedSlidesPlayer";
import { ContentAiTutorPanel } from "@/features/resources/ContentAiTutorPanel";
import { AI_GROUNDING_NOTICE_FR } from "@/domain/contentAi";

export function NarratedReaderView({ resourceId }: { resourceId: string }) {
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  const deck = data.narratedDecks.find((item) => item.mediaId === resourceId);
  /** Support IA correspondant : DTO apprenant, sans aucune donnée source. */
  const aiResource = data.aiResources.find((item) => item.mediaId === resourceId);
  const outcomes = deck
    ? deck.outcomeIds
        .map((id) => data.outcomes.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => o !== undefined)
    : [];

  if (!deck) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="text-xl">Cours indisponible</CardTitle>
          <CardDescription>
            Ce cours n'existe pas, n'est pas encore publié ou sa version web n'a pas été validée par
            l'équipe pédagogique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="min-h-11">
            <Link to="/espace/ressources">Retour aux ressources</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête compact : le contexte reste lisible sans voler la place au lecteur. */}
      <header className="space-y-2 border-b border-border pb-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11 gap-2">
          <Link to="/espace/ressources">
            <ArrowLeft className="size-4" aria-hidden />
            Retour aux ressources
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <h1 className="break-words text-lg font-semibold sm:text-xl">{deck.title}</h1>
          <Badge variant="outline" className="font-normal">
            {deck.webPlayerUrl ? "Prototype réel" : "Simulé"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {deck.module} · {deck.slideCount} diapositives
        </p>
      </header>

      <NarratedSlidesPlayer deck={deck} focused />

      {aiResource ? (
        <section className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">Étudier ce cours avec l'IA</h2>
          <p className="text-xs text-muted-foreground">{AI_GROUNDING_NOTICE_FR}.</p>
          <ContentAiTutorPanel resource={aiResource} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Objectifs travaillés</h2>
        {outcomes.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {outcomes.map((outcome) => (
              <li key={outcome.id}>
                <Badge variant="secondary" className="font-normal">
                  {outcome.code} · {outcome.label}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun objectif rattaché à ce support.</p>
        )}
        <p className="text-sm text-muted-foreground">{deck.description}</p>
        <p className="text-xs text-muted-foreground">
          Consultation en ligne uniquement : la version web dérivée est la seule diffusée aux
          apprenants. La progression reste locale tant que le backend n'est pas raccordé.
        </p>
      </section>
    </div>
  );
}
