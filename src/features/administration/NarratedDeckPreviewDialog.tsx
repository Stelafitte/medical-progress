/**
 * Prévisualisation d'un cours commenté publié, telle que l'étudiant le verra.
 *
 * Chaque diapositive est un clip rendu par PowerPoint : animations, boucles
 * vidéo incluses et narration y sont déjà. Il n'y a donc rien à synchroniser
 * ici — on enchaîne les clips, et le sommaire permet d'aller directement à un
 * chapitre.
 *
 * Les liens sont signés et expirent au bout d'une heure : les fichiers restent
 * privés, rien n'est exposé durablement.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDataAccess } from "@/application/session";
import type { NarratedDeckPlayback } from "@/application/ports/repositories";
import type { LearningResourceId } from "@/domain/types";

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function NarratedDeckPreviewDialog({
  resourceId,
  title,
}: {
  resourceId: string;
  title: string;
}) {
  const dataAccess = useDataAccess();
  const [open, setOpen] = useState(false);
  const [playback, setPlayback] = useState<NarratedDeckPlayback | null>(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dataAccess.resources.getNarratedDeckPlayback(
        resourceId as LearningResourceId,
      );
      if (!result || result.slides.length === 0) {
        setError("Aucun diaporama publié pour ce support.");
        setPlayback(null);
        return;
      }
      setPlayback(result);
      setCurrent(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }, [dataAccess, resourceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const slides = playback?.slides ?? [];
  const slide = slides[current];
  const chapterOf = (index: number) =>
    [...(playback?.chapters ?? [])].reverse().find((chapter) => chapter.startsAtSlide <= index + 1)
      ?.title ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 w-full gap-2 sm:w-auto"
        >
          <PlayCircle className="size-4" aria-hidden />
          Prévisualiser
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Vue étudiant. Les fichiers restent privés : ces liens expirent au bout d&apos;une heure.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Préparation de la lecture…
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {slide ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-md border border-border bg-black">
              {slide.videoUrl ? (
                <video
                  key={slide.videoUrl}
                  className="h-auto w-full"
                  src={slide.videoUrl}
                  poster={slide.imageUrl}
                  controls
                  autoPlay
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
                      className={`w-full rounded px-2 py-1 text-left text-sm ${
                        index === current ? "bg-accent font-medium" : "hover:bg-accent/50"
                      }`}
                      onClick={() => setCurrent(index)}
                    >
                      <span className="font-mono text-xs">
                        {String(item.index).padStart(2, "0")}
                      </span>{" "}
                      {item.title || `Diapositive ${item.index}`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDuration(item.durationMs)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {slide.transcript ? (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">Transcription de la narration</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{slide.transcript}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
