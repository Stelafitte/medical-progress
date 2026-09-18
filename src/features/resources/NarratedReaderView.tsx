/**
 * Écran de lecture dédié d'un diaporama commenté (apprenant).
 * Contrat : la vue ne reçoit qu'un DTO d'artefacts dérivés
 * (`LearnerNarratedDeck`). Aucun nom de fichier, URL, taille, MP4 de secours
 * ni action relative au PPTX source n'y est disponible.
 *
 * LA LECTURE EST RÉELLE DEPUIS LE 18/09. Jusque-là, cet écran montrait un
 * lecteur de démonstration (progression simulée par une minuterie) : aucun étudiant n'avait jamais vu un cours converti. La scène est
 * celle de l'aperçu de la Médiathèque (`NarratedDeckStage`).
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess } from "@/application/session";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { NarratedDeckStage } from "@/features/resources/NarratedDeckStage";
import type { LearningResourceId } from "@/domain/types";

/**
 * Les liens signés du cours, demandés à l'ouverture et seulement là.
 *
 * `staleTime` À 30 MINUTES, ET CE N'EST PAS UN DÉTAIL. Un lien signé vaut une
 * heure. Tant que la requête est fraîche, revenir sur le cours rend LES MÊMES
 * liens : le navigateur ressert alors les clips de son cache au lieu de les
 * retélécharger. Signer à chaque affichage produisait des adresses neuves, donc
 * un cache toujours froid (constat du 17/09).
 */
function LearnerDeckPlayer({
  resourceId,
  showTranscript,
}: {
  readonly resourceId: string;
  readonly showTranscript: boolean;
}) {
  const dataAccess = useDataAccess();
  const { data, isPending, isError } = useQuery({
    queryKey: ["narrated-deck-playback", resourceId],
    queryFn: () => dataAccess.resources.getNarratedDeckPlayback(resourceId as LearningResourceId),
    staleTime: 30 * 60 * 1000,
  });

  if (isPending) return <Skeleton className="aspect-video w-full" />;
  if (isError) {
    return <p className="text-sm text-destructive">Cours momentanément illisible.</p>;
  }
  if (!data || data.slides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucune diapositive publiée pour ce cours.</p>
    );
  }
  return <NarratedDeckStage playback={data} showTranscript={showTranscript} />;
}

export function NarratedReaderView({ resourceId }: { resourceId: string }) {
  const { data, isPending } = useLearnerPassport();
  const dataAccess = useDataAccess();
  const compte = useRef<string | null>(null);

  /*
   * COMPTER L'OUVERTURE DU COURS — la seule assiette d'egress possible.
   *
   * Rien n'enregistrait les consultations, et les métriques Supabase comme
   * Cloudflare sont GLOBALES au projet : aucune ne sait de quel programme vient
   * un octet. On compte donc ici, et l'onglet « Coûts d'exploitation »
   * multiplie par le poids réel du cours (17/09).
   *
   * DEUX PRÉCAUTIONS. Une seule fois par ouverture d'écran (le `ref` évite de
   * recompter à chaque rendu), et la promesse est avalée : un compteur qui
   * trébuche ne doit jamais priver un étudiant de son cours.
   */
  useEffect(() => {
    if (compte.current === resourceId) return;
    compte.current = resourceId;
    void dataAccess.operatingCosts.recordCourseOpened(resourceId).catch(() => undefined);
  }, [dataAccess, resourceId]);

  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  const deck = data.narratedDecks.find((item) => item.mediaId === resourceId);
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
        </div>
        <p className="text-sm text-muted-foreground">
          {deck.module} · {deck.slideCount} diapositives
        </p>
      </header>

      <LearnerDeckPlayer resourceId={deck.mediaId} showTranscript={deck.transcriptAvailable} />

      {/*
        « ETUDIER CE COURS AVEC L'IA » EST DEBRANCHE (Stef, 09/09), pour la
        meme raison que sur « Mes ressources » : c'etait le tuteur de
        DEMONSTRATION, monte a quelques centimetres du vrai assistant. Sa
        source, `listLearnerAiResources`, n'a aucune implementation Supabase et
        rendait deja une liste vide en production. `ContentAiTutorPanel` reste
        sur le disque, debranche.
      */}

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
          apprenants. Ta progression dans le cours n'est pas encore enregistrée.
        </p>
      </section>
    </div>
  );
}
