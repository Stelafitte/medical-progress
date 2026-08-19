/**
 * OUTIL DE TRANSFORMATION AUTOMATIQUE PPTX → LECTEUR WEB HTML5.
 *
 * Cette conversion est RÉELLE et s'exécute entièrement dans le navigateur :
 * décompression du .pptx, extraction des diapositives, des notes du
 * présentateur, des images et des pistes audio, mesure des durées, assemblage
 * d'un paquet HTML5 téléchargeable. Aucun octet n'est envoyé sur le réseau,
 * aucun stockage serveur n'est activé, aucun appel IA n'est effectué.
 *
 * La mise en ligne sur la plateforme reste, elle, simulée : elle exigera le
 * stockage privé et le contrôle pédagogique humain (invariant du projet).
 */
import { useRef, useState } from "react";
import { Download, FileUp, Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { NarratedSlidesPlayer } from "@/features/resources/NarratedSlidesPlayer";
import {
  CONVERSION_ALERT_LABELS_FR,
  CONVERSION_STATUS_LABELS_FR,
  CONVERSION_STEP_LABELS_FR,
  CONVERSION_STEP_STATE_LABELS_FR,
  NARRATED_HUMAN_REVIEW_FR,
  NARRATED_SOURCE_RESTRICTION_FR,
  formatPlayerDuration,
  type LearnerNarratedDeck,
  type NarratedDeck,
} from "@/domain/mediaLibrary";
import {
  buildHtml5Package,
  measureAudioDurations,
  toConversionInput,
  type PptxTransformation,
} from "@/infrastructure/pptx/pptxPipeline";
import { convertPptx, DEFAULT_CONVERSION_OPTIONS } from "@/domain/pptxConversion";
import { readPptxPackage } from "@/infrastructure/pptx/pptxReader";

const PHASES = [
  "Décompression du paquet",
  "Inventaire des diapositives",
  "Extraction audio et notes",
  "Mesure des durées",
  "Assemblage HTML5",
] as const;

/** Aperçu apprenant : DTO dérivé, sans aucune donnée du fichier source. */
function previewDeck(deck: NarratedDeck, title: string): LearnerNarratedDeck | undefined {
  if (!deck.artifact) return undefined;
  const expose = deck.options.exposeTranscriptToLearners;
  return {
    mediaId: "preview",
    title,
    module: "Aperçu de conversion",
    description: "Aperçu du lecteur web dérivé, avant contrôle pédagogique.",
    outcomeIds: [],
    slideCount: deck.artifact.slideCount,
    totalDurationSeconds: deck.artifact.totalDurationSeconds,
    chapters: deck.artifact.chapters,
    slides: deck.artifact.slides.map((slide) => ({
      index: slide.index,
      title: slide.title,
      durationSeconds: slide.durationSeconds,
      hasNarration: slide.hasNarration,
      ...(expose && slide.transcript ? { transcript: slide.transcript } : {}),
    })),
    transcriptAvailable: expose && deck.artifact.hasTranscript,
    availability: "online_only",
  };
}

export function PptxConverterDialog({ onConverted }: { onConverted?: (label: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PptxTransformation | null>(null);
  const [exposeTranscript, setExposeTranscript] = useState(true);
  const [autoChapters, setAutoChapters] = useState(true);
  const [downloaded, setDownloaded] = useState(false);

  const running = phase >= 0 && phase < PHASES.length;

  const run = async (file: File) => {
    setError(null);
    setResult(null);
    setDownloaded(false);
    try {
      setPhase(0);
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPhase(1);
      const inventory = readPptxPackage(file.name, bytes);
      if (inventory.slides.length === 0) throw new Error("Aucune diapositive trouvée dans ce paquet.");
      setPhase(2);
      const durations = await measureAudioDurations(inventory);
      setPhase(3);
      const deck = convertPptx(toConversionInput(inventory, durations), "html5", {
        ...DEFAULT_CONVERSION_OPTIONS,
        autoChapters,
        exposeTranscriptToLearners: exposeTranscript,
      });
      setPhase(4);
      setResult({ inventory, deck });
      setPhase(PHASES.length);
      onConverted?.(
        `Conversion locale réussie : « ${file.name} » → lecteur web HTML5 (${deck.artifact?.slideCount ?? 0} diapositives). Contrôle pédagogique requis avant mise en ligne.`,
      );
    } catch (cause) {
      setPhase(-1);
      setError(cause instanceof Error ? cause.message : "Conversion impossible.");
    }
  };

  const download = () => {
    if (!result) return;
    const zip = buildHtml5Package(result);
    const blob = new Blob([zip as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.inventory.fileName.replace(/\.pptx$/i, "")}-html5.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const deck = result?.deck;
  const preview = deck
    ? previewDeck(deck, result?.inventory.title ?? result?.inventory.fileName ?? "Cours converti")
    : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2">
          <Wand2 className="size-4" aria-hidden />
          Convertir un PPTX
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transformation automatique d'un PowerPoint commenté</DialogTitle>
          <DialogDescription>
            Conversion réelle exécutée dans votre navigateur : le fichier n'est ni téléversé, ni
            transmis, ni stocké sur un serveur. Résultat : un paquet lecteur web HTML5
            (diapositives, audio, transcription, sommaire).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pptx-file">Fichier .pptx</Label>
            <Input
              id="pptx-file"
              ref={inputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="min-h-11"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void run(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Les notes du présentateur alimentent la transcription ; les pistes audio incorporées
              sont rattachées à leur diapositive.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span className="text-sm">Sommaire automatique</span>
              <Switch checked={autoChapters} onCheckedChange={setAutoChapters} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span className="text-sm">Transcription visible par les apprenants</span>
              <Switch checked={exposeTranscript} onCheckedChange={setExposeTranscript} />
            </label>
          </div>

          {running ? (
            <div className="space-y-2">
              <Progress value={((phase + 1) / PHASES.length) * 100} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {PHASES[phase]}…
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          {deck && result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  {CONVERSION_STATUS_LABELS_FR[deck.conversionStatus]}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {deck.artifact?.slideCount ?? 0} diapositives
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {formatPlayerDuration(deck.artifact?.totalDurationSeconds ?? 0)}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {result.inventory.audioFiles.length} piste(s) audio extraite(s)
                </Badge>
              </div>

              {deck.alerts.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {deck.alerts.map((alert) => (
                    <li key={alert}>
                      <Badge variant="outline" className="font-normal">
                        {CONVERSION_ALERT_LABELS_FR[alert]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-1">
                <p className="text-sm font-medium">Journal de conversion</p>
                <ol className="space-y-1 text-sm">
                  {deck.steps.map((entry) => (
                    <li key={entry.step} className="flex flex-wrap items-baseline gap-2">
                      <span>{CONVERSION_STEP_LABELS_FR[entry.step]}</span>
                      <Badge variant="outline" className="font-normal">
                        {CONVERSION_STEP_STATE_LABELS_FR[entry.state]}
                      </Badge>
                      {entry.note ? (
                        <span className="w-full text-xs text-muted-foreground">{entry.note}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="min-h-11 gap-2" onClick={download}>
                  <Download className="size-4" aria-hidden />
                  Télécharger le paquet HTML5
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 gap-2"
                  onClick={() =>
                    onConverted?.(
                      "Mise en ligne simulée : la publication exigera le stockage privé et la validation pédagogique humaine.",
                    )
                  }
                >
                  <FileUp className="size-4" aria-hidden />
                  Mettre en ligne (simulé)
                </Button>
              </div>
              {downloaded ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Paquet généré localement : index.html, manifest.json et médias extraits.
                </p>
              ) : null}

              {preview ? (
                <section className="space-y-2">
                  <p className="text-sm font-medium">Aperçu apprenant du lecteur web</p>
                  <NarratedSlidesPlayer deck={preview} />
                </section>
              ) : null}

              <p className="text-xs text-muted-foreground">
                {NARRATED_SOURCE_RESTRICTION_FR}. {NARRATED_HUMAN_REVIEW_FR}.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
