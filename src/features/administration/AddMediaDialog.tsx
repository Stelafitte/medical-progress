/**
 * Dialogue « Ajouter un support » ENTIÈREMENT SIMULÉ.
 * Le fichier sélectionné n'est jamais lu, ni téléversé, ni transmis : seul son
 * nom est conservé en mémoire le temps de la démonstration.
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
import {
  MEDIA_KIND_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  MEDIA_VISIBILITY_LABELS_FR,
  type MediaKind,
  type MediaVisibility,
} from "@/domain/mediaLibrary";
import type { Outcome, OutcomeId } from "@/domain/types";

export const ADD_MEDIA_SUBMIT_LABEL_FR = "Enregistrer la maquette";

export function AddMediaDialog({
  programName,
  modules,
  outcomes,
  onSaved,
}: {
  programName: string;
  modules: readonly string[];
  outcomes: readonly Outcome[];
  onSaved: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<"file" | "url">("file");
  const [fileName, setFileName] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MediaKind>("pdf");
  const [moduleName, setModuleName] = useState(modules[0] ?? "");
  const [version, setVersion] = useState("v1.0");
  const [visibility, setVisibility] = useState<MediaVisibility>("cohort");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [publish, setPublish] = useState(false);
  const [linked, setLinked] = useState<readonly OutcomeId[]>([]);
  const [description, setDescription] = useState("");

  const reset = () => {
    setOrigin("file");
    setFileName("");
    setUrl("");
    setTitle("");
    setKind("pdf");
    setVersion("v1.0");
    setVisibility("cohort");
    setFrom("");
    setUntil("");
    setPublish(false);
    setLinked([]);
    setDescription("");
  };

  const toggleOutcome = (id: OutcomeId, checked: boolean) =>
    setLinked((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((o) => o !== id)));

  const canSave = title.trim().length > 2 && (origin === "file" ? !!fileName : !!url.trim());

  const save = () => {
    if (!canSave) return;
    onSaved(title.trim());
    reset();
    setOpen(false);
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
            Saisie de métadonnées uniquement. {MEDIA_STORAGE_NOTICE_FR} : aucun fichier n'est lu ni
            transmis.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Origine du support</legend>
          <RadioGroup value={origin} onValueChange={(value) => setOrigin(value as "file" | "url")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="file" id="origin-file" />
              <Label htmlFor="origin-file" className="font-normal">
                Fichier (nom déclaré)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="url" id="origin-url" />
              <Label htmlFor="origin-url" className="font-normal">
                Lien externe
              </Label>
            </div>
          </RadioGroup>
        </fieldset>

        {origin === "file" ? (
          <div className="space-y-1">
            <Label htmlFor="media-file">Fichier</Label>
            <Input
              id="media-file"
              type="file"
              className="min-h-11"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              Seul le nom « {fileName || "—"} » est conservé en mémoire pour la démonstration.
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
            <p className="text-xs text-muted-foreground">L'URL n'est jamais appelée.</p>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="media-new-kind">Type</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as MediaKind)}>
              <SelectTrigger id="media-new-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MEDIA_KIND_LABELS_FR) as MediaKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {MEDIA_KIND_LABELS_FR[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="media-new-module">Module</Label>
            <Select value={moduleName} onValueChange={setModuleName}>
              <SelectTrigger id="media-new-module">
                <SelectValue placeholder="Choisir un module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="media-new-version">Version</Label>
            <Input
              id="media-new-version"
              className="min-h-11"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="media-new-visibility">Visibilité</Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as MediaVisibility)}
            >
              <SelectTrigger id="media-new-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MEDIA_VISIBILITY_LABELS_FR) as MediaVisibility[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {MEDIA_VISIBILITY_LABELS_FR[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="media-from">Disponible à partir du</Label>
            <Input
              id="media-from"
              type="date"
              className="min-h-11"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="media-until">Disponible jusqu'au</Label>
            <Input
              id="media-until"
              type="date"
              className="min-h-11"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </div>
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

        <div className="space-y-1">
          <Label htmlFor="media-description">Description</Label>
          <Textarea
            id="media-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border p-3">
          <Checkbox
            id="media-publish"
            className="mt-0.5"
            checked={publish}
            onCheckedChange={(value) => setPublish(value === true)}
          />
          <Label htmlFor="media-publish" className="font-normal leading-snug">
            Publier immédiatement (simulé — le support resterait un brouillon en base réelle)
          </Label>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Badge variant="outline">Aucun fichier transmis</Badge>
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
            disabled={!canSave}
            onClick={save}
          >
            {ADD_MEDIA_SUBMIT_LABEL_FR}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
