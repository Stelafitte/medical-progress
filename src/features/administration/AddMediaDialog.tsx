/**
 * Dialogue « Ajouter un support » — création réelle (lien, PDF ou vidéo).
 * Le fichier choisi (PDF ou vidéo) est réellement téléversé vers le
 * stockage privé du programme ; un lien externe n'est jamais suivi ni
 * vérifié côté serveur. Les diaporamas sonorisés (PPTX) passent par l'outil
 * de conversion dédié (PptxConverterDialog), pas par ce formulaire.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess } from "@/application/session";
import type { ResourceVisibility } from "@/application/ports/repositories";
import type { CurriculumVersionId, Outcome, OutcomeId, ProgramId } from "@/domain/types";

export const ADD_MEDIA_SUBMIT_LABEL_FR = "Créer le support";

type NewResourceKind = "pdf" | "video" | "link";

const KIND_LABELS_FR: Record<NewResourceKind, string> = {
  pdf: "Document PDF",
  video: "Vidéo",
  link: "Lien externe",
};

const VISIBILITY_LABELS_FR: Record<ResourceVisibility, string> = {
  staff_only: "Équipe pédagogique uniquement",
  cohort: "Classe(s) concernée(s)",
  program: "Tout le programme",
};

export function AddMediaDialog({
  programName,
  programId,
  curriculumVersionId,
  outcomes,
  onSaved,
}: {
  programName: string;
  programId: ProgramId;
  curriculumVersionId: CurriculumVersionId;
  outcomes: readonly Outcome[];
  onSaved: (title: string) => void;
}) {
  const dataAccess = useDataAccess();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewResourceKind>("pdf");
  const [origin, setOrigin] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ResourceVisibility>("cohort");
  const [linked, setLinked] = useState<readonly OutcomeId[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKind("pdf");
    setOrigin("file");
    setFile(null);
    setUrl("");
    setTitle("");
    setDescription("");
    setVisibility("cohort");
    setLinked([]);
    setError(null);
  };

  const toggleOutcome = (id: OutcomeId, checked: boolean) =>
    setLinked((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((o) => o !== id)));

  const changeKind = (next: NewResourceKind) => {
    setKind(next);
    setOrigin(next === "link" ? "url" : "file");
    setFile(null);
    setUrl("");
  };

  const canSave =
    title.trim().length > 2 &&
    (kind === "link" ? url.trim().length > 0 : origin === "file" ? !!file : !!url.trim());

  const save = () => {
    if (!canSave || isSaving) return;
    void (async () => {
      setIsSaving(true);
      setError(null);
      try {
        const resource = await dataAccess.resources.createResource({
          programId,
          curriculumVersionId,
          title: title.trim(),
          description: description.trim(),
          format: kind,
          visibility,
          ...(origin === "url" ? { externalUrl: url.trim() } : {}),
          outcomeIds: linked,
        });
        if (origin === "file" && file) {
          const upload = await dataAccess.resources.requestUploadUrl({
            programId,
            bucket: "course-sources",
            fileName: file.name,
          });
          await dataAccess.resources.uploadResourceFile(upload, file);
          await dataAccess.resources.registerAsset({
            resourceId: resource.id,
            kind: "source",
            bucketName: upload.bucket,
            objectPath: upload.objectPath,
            mediaType: file.type || "application/octet-stream",
            originalFileName: file.name,
            byteSize: file.size,
          });
        }
        onSaved(resource.title);
        reset();
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Création du support impossible.");
      } finally {
        setIsSaving(false);
      }
    })();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="min-h-11 gap-2">
          <Plus className="size-4" aria-hidden />
          Ajouter un support
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un support — {programName}</DialogTitle>
          <DialogDescription>
            Création réelle : le support est enregistré immédiatement dans le catalogue du
            programme.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Type de support</legend>
          <RadioGroup value={kind} onValueChange={(value) => changeKind(value as NewResourceKind)}>
            {(Object.keys(KIND_LABELS_FR) as NewResourceKind[]).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <RadioGroupItem value={k} id={`kind-${k}`} />
                <Label htmlFor={`kind-${k}`} className="font-normal">
                  {KIND_LABELS_FR[k]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        {kind === "video" ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Origine</legend>
            <RadioGroup value={origin} onValueChange={(value) => setOrigin(value as "file" | "url")}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="file" id="origin-file" />
                <Label htmlFor="origin-file" className="font-normal">
                  Fichier vidéo à téléverser
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="url" id="origin-url" />
                <Label htmlFor="origin-url" className="font-normal">
                  Lien vers une vidéo hébergée ailleurs
                </Label>
              </div>
            </RadioGroup>
          </fieldset>
        ) : null}

        {kind !== "link" && origin === "file" ? (
          <div className="space-y-1">
            <Label htmlFor="media-file">Fichier {kind === "pdf" ? "PDF" : "vidéo"}</Label>
            <Input
              id="media-file"
              type="file"
              className="min-h-11"
              accept={kind === "pdf" ? "application/pdf" : "video/mp4,video/webm,video/quicktime"}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              {file ? `« ${file.name} » (${Math.ceil(file.size / 1024)} Ko)` : "Aucun fichier choisi."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="media-url">URL</Label>
            <Input
              id="media-url"
              inputMode="url"
              className="min-h-11"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="media-title">Titre</Label>
          <Input
            id="media-title"
            className="min-h-11"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="media-description">Description</Label>
          <Textarea
            id="media-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="media-visibility">Visibilité</Label>
          <Select
            value={visibility}
            onValueChange={(value) => setVisibility(value as ResourceVisibility)}
          >
            <SelectTrigger id="media-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISIBILITY_LABELS_FR) as ResourceVisibility[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY_LABELS_FR[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Objectifs associés</legend>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-2">
            {outcomes.map((outcome) => (
              <div key={outcome.id} className="flex items-start gap-2">
                <Checkbox
                  id={`outcome-${outcome.id}`}
                  className="mt-0.5"
                  checked={linked.includes(outcome.id)}
                  onCheckedChange={(value) => toggleOutcome(outcome.id, value === true)}
                />
                <Label htmlFor={`outcome-${outcome.id}`} className="font-normal leading-snug">
                  <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          {kind !== "link" && origin === "file" ? (
            <Badge variant="outline">Fichier réellement téléversé</Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => setOpen(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={!canSave || isSaving}
            onClick={save}
          >
            {isSaving ? "Création…" : ADD_MEDIA_SUBMIT_LABEL_FR}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
