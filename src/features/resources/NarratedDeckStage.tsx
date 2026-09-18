/**
 * La SCÈNE d'un diaporama sonorisé publié : le clip (ou l'image), la navigation,
 * le sommaire, la transcription. Partagée par l'aperçu de la Médiathèque et par
 * l'écran de lecture de l'étudiant — l'enseignant voit exactement ce que
 * l'étudiant verra (18/09).
 *
 * Chaque diapositive est un clip rendu par PowerPoint : animations, boucles
 * vidéo et narration y sont déjà. Rien à synchroniser — on enchaîne les clips.
 * Sans clip, l'image fixe.
 *
 * LA PREMIÈRE DIAPOSITIVE NE DÉMARRE PAS SEULE. Un étudiant en stage regarde sur
 * son forfait mobile : rien ne se télécharge avant son premier geste. Une fois
 * la lecture lancée, les clips s'enchaînent d'eux-mêmes.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NarratedDeckPlayback } from "@/application/ports/repositories";

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function NarratedDeckStage({
  playback,
  showTranscript,
}: {
  readonly playback: NarratedDeckPlayback;
  /** L'aperçu enseignant la montre ; l'étudiant seulement si l'équipe l'autorise. */
  readonly showTranscript: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setCurrent(0);
    setStarted(false);
  }, [playback]);

  const slides = playback.slides;
  const slide = slides[current];
  if (!slide) return null;
  const chapterOf = (index: number) =>
    [...playback.chapters].reverse().find((chapter) => chapter.startsAtSlide <= index + 1)?.title ??
    "";

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-black">
        {slide.videoUrl ? (
          <video
            key={slide.videoUrl}
            className="h-auto w-full"
            src={slide.videoUrl}
            poster={slide.imageUrl}
            controls
            playsInline
            preload={started ? "auto" : "none"}
            autoPlay={started}
            onPlay={() => setStarted(true)}
            onEnded={() => setCurrent((index) => Math.min(index + 1, slides.length - 1))}
          />
        ) : slide.imageUrl ? (
          <img className="h-auto w-full" src={slide.imageUrl} alt={slide.title} />
        ) : (
          <p className="p-6 text-sm text-white">Aucun média pour cette diapositive.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-1"
          disabled={current === 0}
          onClick={() => setCurrent((index) => Math.max(index - 1, 0))}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Précédent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-1"
          disabled={current >= slides.length - 1}
          onClick={() => setCurrent((index) => Math.min(index + 1, slides.length - 1))}
        >
          Suivant
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <span className="text-sm text-muted-foreground">
          Diapositive {slide.index} / {slides.length} · {formatDuration(slide.durationMs)}
          {chapterOf(current) ? ` · ${chapterOf(current)}` : ""}
        </span>
      </div>

      <div>
        <p className="text-sm font-medium">Sommaire</p>
        <ol className="mt-1 space-y-1">
          {slides.map((item, index) => (
            <li key={item.index}>
              <button
                type="button"
                className={`min-h-11 w-full rounded px-2 py-1 text-left text-sm ${
                  index === current ? "bg-accent font-medium" : "hover:bg-accent/50"
                }`}
                onClick={() => setCurrent(index)}
              >
                <span className="font-mono text-xs">{String(item.index).padStart(2, "0")}</span>{" "}
                {item.title || `Diapositive ${item.index}`}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDuration(item.durationMs)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {showTranscript && slide.transcript ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Transcription de la narration</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{slide.transcript}</p>
        </div>
      ) : null}
    </div>
  );
}
