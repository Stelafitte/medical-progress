/**
 * Vue détail d'un support : métadonnées, historique des versions et actions
 * SIMULÉES (modifier, nouvelle version, publier/dépublier, archiver, prévisualiser).
 * Aucune écriture, aucun binaire, aucune requête réseau.
 */
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
  MEDIA_ACTION_LABELS_FR,
  MEDIA_KIND_LABELS_FR,
  MEDIA_STATUS_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  MEDIA_VISIBILITY_LABELS_FR,
  availableMediaActions,
  type MediaResource,
} from "@/domain/mediaLibrary";
import type { Outcome } from "@/domain/types";

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11 md:mt-0 md:min-h-9">
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
          <p className="font-medium">Fichier prévu (métadonnée)</p>
          <p className="break-all text-muted-foreground">
            {resource.asset.kind === "url" ? "URL déclarée" : "Nom de fichier déclaré"} :{" "}
            {resource.asset.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {resource.asset.sizeHint ? `Taille indicative ${resource.asset.sizeHint}. ` : ""}
            {resource.asset.durationMinutes
              ? `Durée ${resource.asset.durationMinutes} min. `
              : ""}
            {resource.asset.hasTranscript ? "Transcription disponible. " : ""}
            {MEDIA_STORAGE_NOTICE_FR}.
          </p>
        </div>

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
          {availableMediaActions(resource).map((action) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 w-full sm:w-auto"
              onClick={() =>
                onAction(
                  `Action simulée : ${MEDIA_ACTION_LABELS_FR[action]} — « ${resource.title} ». Aucune donnée modifiée.`,
                )
              }
            >
              {MEDIA_ACTION_LABELS_FR[action]}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
