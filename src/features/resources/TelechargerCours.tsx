import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zipSync } from "fflate";
import { Download, Loader2 } from "lucide-react";
import { useDataAccess, useSession } from "@/application/session";
import { Button } from "@/components/ui/button";
import { planOfflineCourse } from "@/domain/coursHorsLigne";
import type { LearningResourceId } from "@/domain/types";

/** Les trois fichiers du lecteur autonome, servis par le site (public/). */
const LECTEUR = [
  { source: "/lecteur-autonome/index.html", path: "index.html" },
  { source: "/lecteur-autonome/lecteur/app.js", path: "lecteur/app.js" },
  { source: "/lecteur-autonome/lecteur/styles.css", path: "lecteur/styles.css" },
] as const;

async function octets(url: string): Promise<Uint8Array> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Téléchargement refusé (${reponse.status}).`);
  return new Uint8Array(await reponse.arrayBuffer());
}

/**
 * « TÉLÉCHARGER CE COURS » (18/09) -- un ZIP qui s'ouvre par double-clic,
 * assemblé DANS LE NAVIGATEUR (fflate) : aucun Worker, aucun coût serveur.
 *
 * MÊME REQUÊTE QUE LE LECTEUR (`narrated-deck-playback`) : les liens signés
 * sont ceux que la page vient d'utiliser, le navigateur ressert donc les clips
 * déjà vus depuis son cache au lieu de les retélécharger.
 *
 * NIVEAU DE COMPRESSION 0 : vidéos et images sont déjà compressées, les
 * recompresser coûterait du temps de calcul sur un téléphone pour rien.
 */
export function TelechargerCours({
  resourceId,
  title,
}: {
  readonly resourceId: string;
  readonly title: string;
}) {
  const dataAccess = useDataAccess();
  const { person } = useSession();
  const [etat, setEtat] = useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { data: playback } = useQuery({
    queryKey: ["narrated-deck-playback", resourceId],
    queryFn: () => dataAccess.resources.getNarratedDeckPlayback(resourceId as LearningResourceId),
    staleTime: 30 * 60 * 1000,
  });

  async function telecharger() {
    if (!playback || playback.slides.length === 0) return;
    setErreur(null);
    const plan = planOfflineCourse(
      playback.slides.map((slide) => ({
        index: slide.index,
        title: slide.title,
        videoUrl: slide.videoUrl,
        imageUrl: slide.imageUrl,
      })),
      {
        id: resourceId,
        title,
        version: new Date().toISOString().slice(0, 10),
        learnerName: person.fullName,
        learnerEmail: person.email,
        downloadedOn: new Date().toLocaleDateString("fr-FR"),
      },
    );
    const total = plan.downloads.length + LECTEUR.length;
    let fait = 0;
    setEtat({ fait, total });
    try {
      const fichiers: Record<string, Uint8Array> = {};
      for (const piece of LECTEUR) {
        fichiers[`${plan.folder}/${piece.path}`] = await octets(piece.source);
        setEtat({ fait: ++fait, total });
      }
      for (const media of plan.downloads) {
        fichiers[`${plan.folder}/${media.path}`] = await octets(media.url);
        setEtat({ fait: ++fait, total });
      }
      fichiers[`${plan.folder}/manifest.js`] = new TextEncoder().encode(plan.manifestJs);
      const zip = zipSync(fichiers, { level: 0 });
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      lien.download = `${plan.folder}.zip`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 60_000);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le téléchargement a échoué.");
    } finally {
      setEtat(null);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 gap-2"
        disabled={!playback || etat !== null}
        onClick={() => void telecharger()}
      >
        {etat ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {etat ? `Préparation… ${etat.fait}/${etat.total}` : "Télécharger ce cours"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Un dossier à décompresser, puis ouvrir « index.html » : le cours se suit sans connexion. La
        copie porte votre nom.
      </p>
      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
