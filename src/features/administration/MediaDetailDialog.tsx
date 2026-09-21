/**
 * Vue détail d'un support : métadonnées, historique des versions et actions
 * SIMULÉES (modifier, nouvelle version, publier/dépublier, archiver, prévisualiser).
 * Aucune écriture, aucun binaire, aucune requête réseau.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MEDIA_KIND_LABELS_FR,
  MEDIA_STATUS_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  MEDIA_VISIBILITY_LABELS_FR,
  type MediaResource,
} from "@/domain/mediaLibrary";
import type { Outcome } from "@/domain/types";
import { NarratedDeckPreviewDialog } from "@/features/administration/NarratedDeckPreviewDialog";
import { useDataAccess } from "@/application/session";
import type { ResourceTextSegment } from "@/application/ports/repositories";
import type { LearningResourceId } from "@/domain/types";

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

export function MediaDetailDialog({
  resource,
  outcomes,
  authorName,
  onAction,
}: {
  resource: MediaResource;
  outcomes: readonly Outcome[];
  authorName: string;
  onAction: (label: string) => void;
}) {
  const dataAccess = useDataAccess();
  /**
   * Le texte conservé du support, lu à l'OUVERTURE du dialogue.
   *
   * Pas au montage de la ligne : le catalogue affiche des dizaines de supports,
   * et charger le texte de chacun pour n'en ouvrir qu'un serait une requête par
   * ligne pour rien.
   */
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<readonly ResourceTextSegment[] | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTextError(null);
    void (async () => {
      try {
        /*
         * `MediaResource` est la projection « maquette » de `learning_resources` :
         * l'identifiant est la MÊME valeur, portée par deux marques de type
         * différentes. Le double passage par `unknown` est donc un changement
         * d'étiquette, pas une conversion — et il est écrit ici, à un seul
         * endroit, plutôt que dissimulé dans le port.
         */
        const found = await dataAccess.resources.listResourceTexts(
          resource.id as unknown as LearningResourceId,
        );
        if (!cancelled) setSegments(found);
      } catch (err) {
        if (!cancelled) {
          setSegments([]);
          setTextError(err instanceof Error ? err.message : "Texte illisible.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dataAccess, resource.id]);

  const totalChars = (segments ?? []).reduce((n, s) => n + s.content.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 min-h-11 md:mt-0 md:min-h-9"
        >
          Voir le détail
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{resource.title}</DialogTitle>
          <DialogDescription>
            {MEDIA_KIND_LABELS_FR[resource.kind]} · {resource.module} · version {resource.version}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Statut</dt>
            <dd>{MEDIA_STATUS_LABELS_FR[resource.status]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Visibilité</dt>
            <dd>{MEDIA_VISIBILITY_LABELS_FR[resource.visibility]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Auteur</dt>
            <dd>{authorName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Mise à jour</dt>
            <dd>{formatDate(resource.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Disponible du</dt>
            <dd>{formatDate(resource.availableFrom)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Disponible jusqu'au</dt>
            <dd>{formatDate(resource.availableUntil)}</dd>
          </div>
        </dl>

        <p className="text-sm text-muted-foreground">{resource.description}</p>

        {/*
          Le texte conservé. C'est ce qui rend l'import VÉRIFIABLE : jusqu'ici
          on pouvait écrire ce texte et le chercher, pas le relire — donc pas
          constater qu'il est correct.

          Il est montré DIRECTEMENT, pas replié. Premier essai : un <details>
          fermé, dont le résumé annonçait « 7 segments — 25 453 caractères ».
          Stef a ouvert l'écran et a dit ne pas voir le contenu du cours — et il
          avait raison : un contenu derrière un clic de plus, sous un résumé qui
          ressemble à une métadonnée, n'est pas un contenu visible. La hauteur
          est bornée et la boîte défile : le texte ne pousse donc pas les
          métadonnées hors de l'écran sans avoir à se cacher pour autant.
        */}
        <div className="space-y-1 text-sm">
          <p className="font-medium">Contenu conservé</p>
          {segments === null ? (
            <p className="text-muted-foreground">Lecture…</p>
          ) : textError ? (
            <p className="text-destructive text-xs">{textError}</p>
          ) : segments.length === 0 ? (
            <p className="text-muted-foreground">
              Aucun texte conservé pour ce support. Les cours déposés avant la conservation du
              texte, et les diaporamas sonorisés, sont dans ce cas.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {segments.length} segment(s) — {totalChars.toLocaleString("fr-FR")} caractères
              </p>
              <div className="border-border max-h-96 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2">
                <div className="space-y-3">
                  {segments.map((segment) => (
                    <p
                      key={`${segment.sourcePath}-${segment.segmentIndex}`}
                      className="whitespace-pre-wrap break-words text-xs"
                    >
                      {segment.content}
                    </p>
                  ))}
                </div>
              </div>
              {/*
                Le chemin source est rappelé UNE fois sous la boîte, pas devant
                chaque segment : il est identique pour les sept, et le répéter
                coupait le cours en tranches là où il se lit d'un trait.
              */}
              {segments[0]?.sourcePath ? (
                <p className="text-muted-foreground break-all text-xs">
                  Source : {segments[0].sourcePath}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <p className="font-medium">Objectifs liés</p>
          {resource.outcomeIds.length === 0 ? (
            <p className="text-muted-foreground">Aucun objectif rattaché.</p>
          ) : (
            <ul className="space-y-1">
              {resource.outcomeIds.map((id) => {
                const outcome = outcomes.find((o) => o.id === id);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {outcome?.code ?? id}
                    </Badge>
                    <span>{outcome?.label ?? "Objectif hors périmètre"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1 rounded-md border border-dashed border-border p-3 text-sm">
          <p className="font-medium">
            {resource.asset.storageActivated ? "Fichiers du support" : "Fichier prévu (métadonnée)"}
          </p>
          <p className="break-all text-muted-foreground">
            {resource.asset.kind === "url" ? "URL déclarée" : "Nom de fichier déclaré"} :{" "}
            {resource.asset.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {resource.asset.sizeHint ? `Taille indicative ${resource.asset.sizeHint}. ` : ""}
            {resource.asset.durationMinutes ? `Durée ${resource.asset.durationMinutes} min. ` : ""}
            {resource.asset.hasTranscript ? "Transcription disponible. " : ""}
            {resource.asset.storageActivated
              ? "Stockage privé du programme : accessible uniquement par lien signé et temporaire."
              : `${MEDIA_STORAGE_NOTICE_FR}.`}
          </p>
        </div>

        {/* La fiche de conversion simulée (NarratedConversionPanel) n'est plus
            montée depuis le 21/09 : la conversion réelle passe par convert.ps1
            puis « Publier un cours commenté ». */}

        <div className="space-y-2 text-sm">
          <p className="font-medium">Historique des versions</p>
          <ol className="space-y-2">
            {resource.versions.map((version) => (
              <li key={version.version} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {version.version}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(version.changedAt)} · {MEDIA_STATUS_LABELS_FR[version.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{version.summary}</p>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {/*
            « Prévisualiser » est la seule action réelle de cette fiche : elle
            joue le diaporama publié. Les autres (archiver, remplacer…) ne
            n'affichaient qu'un message factice : retirées le 21/09.
          */}
          <NarratedDeckPreviewDialog resourceId={resource.id} title={resource.title} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
