/**
 * PUBLICATION D'UN COURS COMMENTÉ CONVERTI.
 *
 * Le rendu fidèle d'un diaporama — animations comprises, boucles vidéo
 * incluses — n'est possible que par PowerPoint lui-même. Il est donc produit
 * hors ligne par `tools/pptx-poc/convert.ps1`, qui écrit un dossier
 * `course-package` : un manifeste, une image et un clip par diapositive, la
 * narration, le sommaire et le texte.
 *
 * Cet écran prend ce dossier et le publie réellement : téléversement de chaque
 * fichier vers le stockage privé du programme via URL signée, enregistrement de
 * chaque asset, puis publication du diaporama en une transaction.
 *
 * Le .pptx source n'est jamais exigé : le paquet n'en contient rien. Il peut
 * être joint séparément, et n'est alors visible que de l'équipe pédagogique.
 */
import { useRef, useState } from "react";
import { FolderUp, Loader2, Upload } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataAccess } from "@/application/session";
import type {
  NarratedDeckSlideInput,
  RegisteredResourceAsset,
  ResourceAssetKind,
  ResourceVisibility,
} from "@/application/ports/repositories";
import type { CurriculumVersionId, Outcome, OutcomeId, ProgramId } from "@/domain/types";
import { requireCanonicalMediaType } from "@/infrastructure/storage/mediaTypes";

export const PUBLISH_PACKAGE_LABEL_FR = "Publier le cours";

const VISIBILITY_LABELS_FR: Record<ResourceVisibility, string> = {
  staff_only: "Équipe pédagogique uniquement",
  cohort: "Classe(s) concernée(s)",
  program: "Tout le programme",
};

/** Contrat de sortie de `build_package.py`. Seuls les champs consommés ici. */
interface PackageManifest {
  readonly schemaVersion: string;
  readonly course: {
    readonly title: string;
    readonly slideCount: number;
    readonly totalDurationMs: number;
  };
  readonly outline?: readonly {
    readonly chapterIndex: number;
    readonly title: string;
    readonly startsAtSlide: number;
  }[];
  readonly slides: readonly {
    readonly index: number;
    readonly title: string;
    readonly imageUrl: string;
    readonly videoUrl: string | null;
    readonly audioUrl: string | null;
    readonly durationMs: number | null;
  }[];
}

interface CourseText {
  readonly slides?: readonly { readonly index: number; readonly slideText?: string }[];
}

/** Chemin dans le paquet, quel que soit le nom du dossier choisi. */
function packagePath(file: File): string {
  const relative = file.webkitRelativePath || file.name;
  const parts = relative.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : relative;
}

export function NarratedPackagePublishDialog({
  programName,
  programId,
  curriculumVersionId,
  outcomes,
  onPublished,
}: {
  programName: string;
  programId: ProgramId;
  curriculumVersionId: CurriculumVersionId;
  outcomes: readonly Outcome[];
  onPublished: (title: string) => void;
}) {
  const dataAccess = useDataAccess();
  const folderRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [manifest, setManifest] = useState<PackageManifest | null>(null);
  const [courseText, setCourseText] = useState<CourseText | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<ResourceVisibility>("cohort");
  const [transcribe, setTranscribe] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [linked, setLinked] = useState<readonly OutcomeId[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFiles(new Map());
    setManifest(null);
    setCourseText(null);
    setSourceFile(null);
    setLinked([]);
    setProgress(null);
    setError(null);
    setWarning(null);
    if (folderRef.current) folderRef.current.value = "";
  };

  const readFolder = async (list: FileList | null) => {
    setError(null);
    setManifest(null);
    setCourseText(null);
    if (!list || list.length === 0) return;

    const map = new Map<string, File>();
    for (const file of Array.from(list)) map.set(packagePath(file), file);
    setFiles(map);

    const manifestFile = map.get("manifest.json");
    if (!manifestFile) {
      setError("Ce dossier ne contient pas de manifest.json : ce n'est pas un paquet converti.");
      return;
    }
    try {
      const parsed = JSON.parse(await manifestFile.text()) as PackageManifest;
      const missing = parsed.slides.flatMap((slide) =>
        [slide.imageUrl, slide.videoUrl, slide.audioUrl].filter(
          (path): path is string => Boolean(path) && !map.has(path as string),
        ),
      );
      if (missing.length > 0) {
        setError(
          `${missing.length} fichier(s) annoncés par le manifeste sont absents du dossier, ` +
            `à commencer par ${missing[0]}.`,
        );
        return;
      }
      setManifest(parsed);
      const textFile = map.get("text/course.json");
      if (textFile) setCourseText(JSON.parse(await textFile.text()) as CourseText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Manifeste illisible.");
    }
  };

  const toggleOutcome = (id: OutcomeId, checked: boolean) =>
    setLinked((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((o) => o !== id)));

  const publish = () => {
    if (!manifest || progress) return;
    void (async () => {
      setError(null);
      // 1 support, 1 manifeste, puis image + clip + audio par diapositive.
      const uploads =
        1 +
        (sourceFile ? 1 : 0) +
        manifest.slides.reduce(
          (count, slide) =>
            count + 1 + (slide.videoUrl ? 1 : 0) + (slide.audioUrl ? 1 : 0),
          0,
        );
      let done = 0;
      const step = (label: string) => setProgress({ done, total: uploads + 1, label });
      step("Création du support…");

      try {
        const resource = await dataAccess.resources.createResource({
          programId,
          curriculumVersionId,
          title: manifest.course.title,
          description: `Cours commenté — ${manifest.course.slideCount} diapositives`,
          format: "narrated_slides",
          visibility,
          outcomeIds: linked,
        });

        const send = async (
          path: string,
          kind: ResourceAssetKind,
          bucket: "pptx-sources" | "course-artifacts",
          label: string,
        ): Promise<RegisteredResourceAsset> => {
          const file = files.get(path);
          if (!file) throw new Error(`Fichier absent du paquet : ${path}`);
          step(label);
          const upload = await dataAccess.resources.requestUploadUrl({
            programId,
            bucket,
            fileName: file.name,
          });
          await dataAccess.resources.uploadResourceFile(upload, file);
          const asset = await dataAccess.resources.registerAsset({
            resourceId: resource.id,
            kind,
            bucketName: upload.bucket,
            objectPath: upload.objectPath,
            mediaType: requireCanonicalMediaType(file.name),
            originalFileName: file.name,
            byteSize: file.size,
          });
          done += 1;
          step(label);
          return asset;
        };

        let sourceAssetId: string | null = null;
        if (sourceFile) {
          step("Téléversement du diaporama source…");
          const upload = await dataAccess.resources.requestUploadUrl({
            programId,
            bucket: "pptx-sources",
            fileName: sourceFile.name,
          });
          await dataAccess.resources.uploadResourceFile(upload, sourceFile);
          const asset = await dataAccess.resources.registerAsset({
            resourceId: resource.id,
            kind: "source",
            bucketName: upload.bucket,
            objectPath: upload.objectPath,
            mediaType: requireCanonicalMediaType(sourceFile.name),
            originalFileName: sourceFile.name,
            byteSize: sourceFile.size,
          });
          sourceAssetId = asset.id;
          done += 1;
        }

        await send("manifest.json", "manifest", "course-artifacts", "Téléversement du manifeste…");

        const textByIndex = new Map(
          (courseText?.slides ?? []).map((item) => [item.index, item.slideText ?? ""]),
        );
        const slides: NarratedDeckSlideInput[] = [];
        for (const slide of manifest.slides) {
          const position = `diapositive ${slide.index} sur ${manifest.slides.length}`;
          const slideText = textByIndex.get(slide.index) ?? "";
          const image = await send(
            slide.imageUrl,
            "slide_image",
            "course-artifacts",
            `Image, ${position}…`,
          );
          const video = slide.videoUrl
            ? await send(slide.videoUrl, "slide_video", "course-artifacts", `Clip, ${position}…`)
            : null;
          const audio = slide.audioUrl
            ? await send(slide.audioUrl, "slide_audio", "course-artifacts", `Audio, ${position}…`)
            : null;
          slides.push({
            slideIndex: slide.index,
            title: slide.title,
            durationMs: slide.durationMs ?? 0,
            imageAssetId: image.id,
            ...(video ? { videoAssetId: video.id } : {}),
            ...(audio ? { audioAssetId: audio.id } : {}),
            ...(slideText ? { slideText } : {}),
          });
        }

        step("Publication du cours…");
        await dataAccess.resources.publishNarratedDeck({
          resourceId: resource.id,
          sourceAssetId,
          slideCount: manifest.course.slideCount,
          durationMs: manifest.course.totalDurationMs,
          transcriptAvailable: false,
          slides,
          chapters: (manifest.outline ?? []).map((chapter) => ({
            chapterIndex: chapter.chapterIndex,
            title: chapter.title,
            startsAtSlide: chapter.startsAtSlide,
          })),
        });

        // Le cours est publié : ce qui suit ne peut plus le remettre en cause.
        // Une transcription qui échoue laisse un cours complet, sans texte de
        // narration, et se relance plus tard.
        let transcriptionWarning: string | null = null;
        if (transcribe) {
          try {
            let guard = manifest.slides.length + 5;
            for (;;) {
              const state = await dataAccess.resources.transcribeNextSlide(resource.id);
              setProgress({
                done: uploads + 1,
                total: uploads + 1,
                label:
                  state.slideIndex === null
                    ? "Transcription terminée."
                    : `Transcription, diapositive ${state.slideIndex} ` +
                      `(${state.remaining} restante(s))…`,
              });
              if (state.done) break;
              guard -= 1;
              if (guard <= 0) {
                transcriptionWarning =
                  "Transcription interrompue par sécurité : relancez-la depuis le support.";
                break;
              }
            }
          } catch (cause) {
            transcriptionWarning =
              "Le cours est publié, mais la transcription de la narration a échoué : " +
              (cause instanceof Error ? cause.message : "cause inconnue") +
              ".";
          }
        }

        onPublished(manifest.course.title);
        if (transcriptionWarning) {
          setWarning(transcriptionWarning);
          setProgress(null);
        } else {
          reset();
          setOpen(false);
        }
      } catch (cause) {
        setProgress(null);
        setError(cause instanceof Error ? cause.message : "Publication impossible.");
      }
    })();
  };

  const slideCount = manifest?.slides.length ?? 0;
  const clipCount = manifest?.slides.filter((slide) => slide.videoUrl).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (progress) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="min-h-11 gap-2">
          <FolderUp className="size-4" aria-hidden />
          Publier un cours converti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publier un cours commenté — {programName}</DialogTitle>
          <DialogDescription>
            Choisissez le dossier produit par la conversion. Les diapositives, les clips et la
            narration sont téléversés vers le stockage privé du programme.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="package-folder">Dossier du cours converti</Label>
          <Input
            id="package-folder"
            ref={folderRef}
            type="file"
            className="min-h-11"
            multiple
            // @ts-expect-error -- attribut non standard, seul moyen de choisir un dossier
            webkitdirectory=""
            directory=""
            onChange={(event) => void readFolder(event.target.files)}
          />
          {manifest ? (
            <p className="text-xs text-muted-foreground">
              « {manifest.course.title} » — {slideCount} diapositives, {clipCount} avec clip,{" "}
              {Math.round(manifest.course.totalDurationMs / 60000)} min.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Le dossier doit contenir manifest.json, produit par convert.ps1.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="package-source">Diaporama source (facultatif)</Label>
          <Input
            id="package-source"
            type="file"
            className="min-h-11"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Conservé dans le stockage privé, jamais exposé aux étudiants.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="package-visibility">Visibilité</Label>
          <Select
            value={visibility}
            onValueChange={(value) => setVisibility(value as ResourceVisibility)}
          >
            <SelectTrigger id="package-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISIBILITY_LABELS_FR) as ResourceVisibility[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {VISIBILITY_LABELS_FR[value]}
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
                  id={`package-outcome-${outcome.id}`}
                  className="mt-0.5"
                  checked={linked.includes(outcome.id)}
                  onCheckedChange={(value) => toggleOutcome(outcome.id, value === true)}
                />
                <Label
                  htmlFor={`package-outcome-${outcome.id}`}
                  className="font-normal leading-snug"
                >
                  <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start gap-2">
          <Checkbox
            id="package-transcribe"
            className="mt-0.5"
            checked={transcribe}
            onCheckedChange={(value) => setTranscribe(value === true)}
          />
          <Label htmlFor="package-transcribe" className="font-normal leading-snug">
            Transcrire la narration après publication
            <span className="block text-xs text-muted-foreground">
              Le texte de la voix devient lisible et exploitable par l&apos;IA. Une diapositive à la
              fois, après la mise en ligne : un échec ne remet pas le cours en cause.
            </span>
          </Label>
        </div>

        {warning ? (
          <p role="status" className="rounded-md border border-border px-3 py-2 text-sm">
            {warning}
          </p>
        ) : null}

        {progress ? (
          <div className="space-y-2" aria-live="polite">
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
            <p className="text-sm text-muted-foreground">
              {progress.label} ({progress.done}/{progress.total})
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full sm:w-auto"
            disabled={Boolean(progress)}
            onClick={() => setOpen(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full gap-2 sm:w-auto"
            disabled={!manifest || Boolean(progress)}
            onClick={publish}
          >
            {progress ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {progress ? "Publication…" : PUBLISH_PACKAGE_LABEL_FR}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
