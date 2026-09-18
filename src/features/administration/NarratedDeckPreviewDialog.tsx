/**
 * Prévisualisation d'un cours commenté publié, telle que l'étudiant le verra.
 *
 * La scène elle-même (clips, navigation, sommaire) vit dans
 * `NarratedDeckStage`, partagée avec l'écran de lecture de l'étudiant.
 *
 * Les liens sont signés et expirent au bout d'une heure : les fichiers restent
 * privés, rien n'est exposé durablement.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
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
import { NarratedDeckStage } from "@/features/resources/NarratedDeckStage";

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }, [dataAccess, resourceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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

        {playback ? <NarratedDeckStage playback={playback} showTranscript /> : null}
      </DialogContent>
    </Dialog>
  );
}
