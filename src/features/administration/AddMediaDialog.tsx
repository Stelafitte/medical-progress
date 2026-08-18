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
  CONVERSION_ALERT_LABELS_FR,
  CONVERSION_TARGET_LABELS_FR,
  MEDIA_KIND_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  MEDIA_VISIBILITY_LABELS_FR,
  NARRATED_RECOMMENDED_FORMAT_FR,
  NARRATED_SOURCE_RESTRICTION_FR,
  NARRATED_SUBMIT_LABEL_FR,
  NARRATED_UPLOAD_LABEL_FR,
  checkPptxUpload,
  type ConversionTarget,
  type MediaKind,
  type MediaVisibility,
} from "@/domain/mediaLibrary";
import {
  WEB_ACCESS_MODE_LABELS_FR,
  WEB_CHECK_FREQUENCY_LABELS_FR,
  WEB_CRAWL_DEPTH_LABELS_FR,
  WEB_PRECHECK_NOTICE_FR,
  WEB_SNAPSHOT_NOTICE_FR,
  checkWebPageUrl,
  type WebAccessMode,
  type WebCheckFrequency,
  type WebCrawlDepth,
} from "@/domain/webPage";
import { AI_MOCK_NOTICE_FR, PUBLICATION_BLOCKED_NOTICE_FR } from "@/domain/contentAi";
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
  // Options de conversion du PPTX sonorisé (toutes simulées).
  const [target, setTarget] = useState<ConversionTarget>("html5");
  const [extractNotes, setExtractNotes] = useState(true);
  const [generateTranscript, setGenerateTranscript] = useState(true);
  const [autoChapters, setAutoChapters] = useState(true);
  const [exposeTranscript, setExposeTranscript] = useState(true);
  // Options d'ingestion d'une page web HTML (toutes simulées).
  const [webAccess, setWebAccess] = useState<WebAccessMode>("public");
  const [webFrequency, setWebFrequency] = useState<WebCheckFrequency>("quarterly");
  const [webDepth, setWebDepth] = useState<WebCrawlDepth>("page_only");
  const [subpages, setSubpages] = useState("");

  const isNarrated = kind === "slides_audio";
  const isWebPage = kind === "web_page";
  /**
   * Contrôle simulé : les caractéristiques déclarées sont dérivées du nom de
   * fichier, aucun binaire n'est ouvert ni transmis.
   */
  const precheck = checkPptxUpload({
    fileName: fileName || url,
    hasAudio: true,
    slideCount: 8,
    slidesWithoutNarration: [4],
    estimatedDurationMinutes: 21,
    fontsEmbedded: false,
  });

  /** Pré-contrôle purement syntaxique : l'URL n'est jamais appelée. */
  const webPrecheck = checkWebPageUrl({
    url,
    reachableDeclared: true,
    ...(title ? { detectedTitle: title } : {}),
    detectedLanguage: "fr",
    sectionCount: 12,
  });

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
            <Label htmlFor="media-file">{isNarrated ? NARRATED_UPLOAD_LABEL_FR : "Fichier"}</Label>
            <Input
              id="media-file"
              type="file"
              className="min-h-11"
              {...(isNarrated ? { accept: ".pptx" } : {})}
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

        {isNarrated ? (
          <section className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Conversion en lecteur web</p>
              <p className="text-xs text-muted-foreground">{NARRATED_SOURCE_RESTRICTION_FR}.</p>
              <p className="text-xs text-muted-foreground">{NARRATED_RECOMMENDED_FORMAT_FR}.</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Sortie de conversion</legend>
              <RadioGroup
                value={target}
                onValueChange={(value) => setTarget(value as ConversionTarget)}
              >
                {(Object.keys(CONVERSION_TARGET_LABELS_FR) as ConversionTarget[]).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem value={t} id={`target-${t}`} />
                    <Label htmlFor={`target-${t}`} className="font-normal leading-snug">
                      {CONVERSION_TARGET_LABELS_FR[t]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Options (simulées)</legend>
              {(
                [
                  ["notes", "Extraire les notes du diaporama", extractNotes, setExtractNotes],
                  [
                    "transcript",
                    "Générer la transcription",
                    generateTranscript,
                    setGenerateTranscript,
                  ],
                  [
                    "chapters",
                    "Créer les chapitres automatiquement",
                    autoChapters,
                    setAutoChapters,
                  ],
                  [
                    "expose",
                    "Autoriser la transcription côté apprenant",
                    exposeTranscript,
                    setExposeTranscript,
                  ],
                ] as const
              ).map(([id, label, checked, setter]) => (
                <div key={id} className="flex items-start gap-2">
                  <Checkbox
                    id={`conv-${id}`}
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(value) => setter(value === true)}
                  />
                  <Label htmlFor={`conv-${id}`} className="font-normal leading-snug">
                    {label}
                  </Label>
                </div>
              ))}
            </fieldset>

            <div className="space-y-1 rounded-md border border-dashed border-border p-3 text-xs">
              <p className="text-sm font-medium">Contrôle avant conversion (simulé)</p>
              <p>Extension .pptx : {precheck.extensionOk ? "conforme" : "non conforme"}</p>
              <p>Audio détecté : {precheck.audioDetected ? "oui" : "non"}</p>
              <p>Diapositives : {precheck.slideCount}</p>
              <p>Durée estimée : {precheck.estimatedDurationMinutes} min</p>
              <p>
                Diapositives sans commentaire :{" "}
                {precheck.slidesWithoutNarration.length > 0
                  ? precheck.slidesWithoutNarration.join(", ")
                  : "aucune"}
              </p>
              {precheck.alerts.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {precheck.alerts.map((alert) => (
                    <li key={alert}>
                      <Badge variant="outline" className="font-normal">
                        {CONVERSION_ALERT_LABELS_FR[alert]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {isWebPage ? (
          <section className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Page web HTML — ingestion du contenu</p>
              <p className="text-xs text-muted-foreground">{WEB_SNAPSHOT_NOTICE_FR}.</p>
              <p className="text-xs text-muted-foreground">{WEB_PRECHECK_NOTICE_FR}.</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="web-url">URL de la page</Label>
              <Input
                id="web-url"
                inputMode="url"
                className="min-h-11"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="web-access">Accès</Label>
                <Select
                  value={webAccess}
                  onValueChange={(value) => setWebAccess(value as WebAccessMode)}
                >
                  <SelectTrigger id="web-access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(WEB_ACCESS_MODE_LABELS_FR) as WebAccessMode[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {WEB_ACCESS_MODE_LABELS_FR[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="web-frequency">Fréquence de vérification</Label>
                <Select
                  value={webFrequency}
                  onValueChange={(value) => setWebFrequency(value as WebCheckFrequency)}
                >
                  <SelectTrigger id="web-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(WEB_CHECK_FREQUENCY_LABELS_FR) as WebCheckFrequency[]).map(
                      (f) => (
                        <SelectItem key={f} value={f}>
                          {WEB_CHECK_FREQUENCY_LABELS_FR[f]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Profondeur d'extraction</legend>
              <RadioGroup
                value={webDepth}
                onValueChange={(value) => setWebDepth(value as WebCrawlDepth)}
              >
                {(Object.keys(WEB_CRAWL_DEPTH_LABELS_FR) as WebCrawlDepth[]).map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <RadioGroupItem value={d} id={`depth-${d}`} />
                    <Label htmlFor={`depth-${d}`} className="font-normal leading-snug">
                      {WEB_CRAWL_DEPTH_LABELS_FR[d]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            {webDepth === "selected_subpages" ? (
              <div className="space-y-1">
                <Label htmlFor="web-subpages">Sous-pages sélectionnées (une par ligne)</Label>
                <Textarea
                  id="web-subpages"
                  rows={3}
                  value={subpages}
                  onChange={(event) => setSubpages(event.target.value)}
                  placeholder="/pathologie/douleur-thoracique"
                />
              </div>
            ) : null}

            <div className="space-y-1 rounded-md border border-dashed border-border p-3 text-xs">
              <p className="text-sm font-medium">Contrôle avant ingestion (simulé)</p>
              <p>URL http/https : {webPrecheck.urlValid ? "conforme" : "non conforme"}</p>
              <p>Domaine : {webPrecheck.host ?? "—"}</p>
              <p>URL canonique : {webPrecheck.canonicalUrl ?? "—"}</p>
              <p>Accessibilité déclarée : {webPrecheck.reachableDeclared ? "oui" : "non"}</p>
              <p>Sections structurées estimées : {webPrecheck.sectionCount ?? "—"}</p>
              <p>
                Étapes prévues : extraction du contenu principal, nettoyage navigation/publicité,
                structuration, instantané versionné, contrôle pédagogique, indexation IA.
              </p>
              <p className="text-muted-foreground">{PUBLICATION_BLOCKED_NOTICE_FR}.</p>
            </div>
          </section>
        ) : null}

        {kind === "link" ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Lien externe simple : il reste <strong>hors du corpus IA</strong> tant qu'une décision
            explicite n'a pas été prise (transformation en page web HTML, en document déposé, ou
            non-publication). {AI_MOCK_NOTICE_FR}.
          </p>
        ) : null}

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
            {isNarrated ? NARRATED_SUBMIT_LABEL_FR : ADD_MEDIA_SUBMIT_LABEL_FR}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
