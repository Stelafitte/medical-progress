/**
 * Lecteur web HTML5 de diaporama sonorisé — DÉMONSTRATION.
 * Les diapositives et la progression sont simulées localement : aucun audio
 * réel n'est chargé et le fichier PPTX source n'est jamais exposé ni
 * téléchargeable côté apprenant.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  NARRATED_ONLINE_ONLY_FR,
  PLAYER_SPEEDS,
  chapterForSlide,
  formatPlayerDuration,
  type LearnerNarratedDeck,
} from "@/domain/mediaLibrary";

export function NarratedSlidesPlayer({
  deck,
  /** Mode écran dédié : diapositive agrandie et bouton plein écran. */
  focused = false,
}: {
  deck: LearnerNarratedDeck;
  focused?: boolean;
}) {
  const [slideIndex, setSlideIndex] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [resumePoint, setResumePoint] = useState<number | null>(null);
  const [visited, setVisited] = useState<readonly number[]>([1]);
  const [fullscreen, setFullscreen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const container = useRef<HTMLElement | null>(null);

  const slides = deck.slides;
  const completed = visited.length >= deck.slideCount;
  const current = slides.find((s) => s.index === slideIndex) ?? slides[0];
  const chapter = chapterForSlide(deck.chapters, slideIndex);

  const offsetBefore = useMemo(
    () => slides.filter((s) => s.index < slideIndex).reduce((sum, s) => sum + s.durationSeconds, 0),
    [slides, slideIndex],
  );
  const total = deck.totalDurationSeconds || 1;
  const position = Math.min(total, offsetBefore + elapsed);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setElapsed((value) => value + speed), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, slideIndex]);

  useEffect(() => {
    setVisited((prev) => (prev.includes(slideIndex) ? prev : [...prev, slideIndex]));
  }, [slideIndex]);

  // Plein écran natif du lecteur, sans quitter la route.
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const node = container.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void node.requestFullscreen?.();
  };

  // Enchaînement simulé vers la diapositive suivante.
  useEffect(() => {
    const duration = current?.durationSeconds ?? 0;
    if (!playing || duration === 0 || elapsed < duration) return;
    if (slideIndex < slides.length) {
      setSlideIndex(slideIndex + 1);
      setElapsed(0);
    } else {
      setPlaying(false);
    }
  }, [playing, elapsed, current, slideIndex, slides.length]);

  const goTo = (index: number) => {
    const next = Math.min(slides.length, Math.max(1, index));
    setResumePoint(slideIndex);
    setSlideIndex(next);
    setElapsed(0);
  };

  if (deck.webPlayerUrl) {
    return (
      <article
        ref={container}
        className="space-y-3 overflow-auto rounded-lg border border-border bg-card p-3 sm:p-4"
      >
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">{NARRATED_ONLINE_ONLY_FR}</Badge>
            <Badge variant="outline" className="font-normal">Lecteur web HTML5 réel</Badge>
            {focused ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto min-h-11 gap-2"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
              >
                {fullscreen ? (
                  <Minimize className="size-4" aria-hidden />
                ) : (
                  <Maximize className="size-4" aria-hidden />
                )}
                {fullscreen ? "Quitter le plein écran" : "Plein écran"}
              </Button>
            ) : null}
          </div>
          <h3 className="break-words text-base font-semibold">{deck.title}</h3>
          <p className="text-sm text-muted-foreground">
            {deck.slideCount} diapositives · audio réel extrait du support
          </p>
        </header>
        <iframe
          title={`Lecteur du cours ${deck.title}`}
          src={deck.webPlayerUrl}
          className={focused ? "h-[72vh] min-h-[34rem] w-full rounded-md border" : "h-[36rem] w-full rounded-md border"}
          allow="autoplay; fullscreen"
          sandbox="allow-scripts allow-same-origin"
        />
        <p className="text-xs text-muted-foreground">
          Le lecteur reçoit uniquement les images, les pistes audio et le manifeste dérivés.
        </p>
      </article>
    );
  }

  return (
    <article
      ref={container}
      className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4"
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {NARRATED_ONLINE_ONLY_FR}
          </Badge>
          <Badge variant="outline" className="font-normal">
            Lecteur web HTML5 (maquette)
          </Badge>
          {completed ? (
            <Badge className="gap-1 font-normal">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Cours parcouru
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              {visited.length}/{deck.slideCount} diapositives vues
            </Badge>
          )}
          {focused ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto min-h-11 gap-2"
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              {fullscreen ? (
                <Minimize className="size-4" aria-hidden />
              ) : (
                <Maximize className="size-4" aria-hidden />
              )}
              {fullscreen ? "Quitter le plein écran" : "Plein écran"}
            </Button>
          ) : null}
        </div>
        <h3 className="break-words text-base font-semibold">{deck.title}</h3>
        <p className="text-sm text-muted-foreground">
          {chapter ? `${chapter.title} · ` : ""}Diapositive {slideIndex}/{deck.slideCount}
        </p>
      </header>

      {/* Grande zone diapositive : rendu web dérivé, jamais le PPTX source. */}
      <div
        className={
          focused
            ? "flex min-h-64 flex-col justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/40 p-4 text-center sm:min-h-80 lg:min-h-[26rem]"
            : "flex min-h-48 flex-col justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/40 p-4 text-center sm:min-h-64"
        }
        role="img"
        aria-label={`Diapositive ${slideIndex} : ${current?.title ?? ""}`}
      >
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Diapositive {slideIndex}
        </p>
        <p className="break-words text-lg font-medium">{current?.title}</p>
        <p className="text-xs text-muted-foreground">
          {current?.hasNarration
            ? `Commentaire audio simulé · ${formatPlayerDuration(current.durationSeconds)}`
            : "Aucun commentaire audio sur cette diapositive"}
        </p>
      </div>

      <div className="space-y-1">
        <Progress value={(position / total) * 100} aria-label="Progression de la lecture" />
        <p className="text-xs text-muted-foreground">
          {formatPlayerDuration(position)} / {formatPlayerDuration(total)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => goTo(slideIndex - 1)}
          disabled={slideIndex === 1}
          aria-label="Diapositive précédente"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Précédent
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? "Mettre en pause" : "Lire"}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
          {playing ? "Pause" : "Lecture"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => goTo(slideIndex + 1)}
          disabled={slideIndex === slides.length}
          aria-label="Diapositive suivante"
        >
          Suivant
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => (resumePoint ? goTo(resumePoint) : undefined)}
          disabled={resumePoint === null}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reprendre
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Vitesse</span>
        {PLAYER_SPEEDS.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={speed === value ? "secondary" : "outline"}
            className="min-h-11"
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
          >
            {value.toLocaleString("fr-FR")}×
          </Button>
        ))}
      </div>

      <p role="status" className="text-xs text-muted-foreground">
        Progression simulée : diapositive {slideIndex} sur {deck.slideCount}
        {completed ? " — état de complétion : cours parcouru" : ""}
        {resumePoint ? ` — reprise possible à la diapositive ${resumePoint}` : ""}.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          aria-expanded={showChapters}
          onClick={() => setShowChapters((v) => !v)}
        >
          <List className="size-4" aria-hidden />
          Sommaire
        </Button>
        {deck.transcriptAvailable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 gap-2"
            aria-expanded={showTranscript}
            onClick={() => setShowTranscript((v) => !v)}
          >
            <Type className="size-4" aria-hidden />
            Transcription
          </Button>
        ) : null}
      </div>

      {showChapters ? (
        <nav aria-label="Sommaire des chapitres">
          <ol className="space-y-1">
            {deck.chapters.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 w-full justify-start text-left"
                  onClick={() => goTo(item.startSlide)}
                >
                  <span className="truncate">
                    {item.title} — diapositive {item.startSlide}
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {showTranscript && deck.transcriptAvailable ? (
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-3 text-sm">
          {slides.map((item) => (
            <p
              key={item.index}
              className={item.index === slideIndex ? "font-medium" : "text-muted-foreground"}
            >
              <span className="font-mono text-xs">{item.index}.</span>{" "}
              {item.transcript ?? "Pas de commentaire pour cette diapositive."}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
