import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, ImageOff, Send, Trash2 } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess, useSession } from "@/application/session";
import { StageLogPhotoDialog } from "@/features/stage/StageLogPhotoDialog";
import {
  PHOTO_BANNER_FR,
  PHOTO_NO_GUARANTEE_FR,
  STAGE_LOG_STATUS_LABELS_FR,
  isEntryComplete,
  isPhotoAllowed,
  nextStageLogStatus,
  templatesForContext,
  type StageLogEntry,
  type StageLogPhotoAttachment,
  type StageLogStatus,
  type StageLogTemplate,
} from "@/domain/stageLog";

/** Carnet de stage de l'apprenant : saisie rapide et workflow simulés. */
export function StageLogBook() {
  const dataAccess = useDataAccess();
  const { activeProgram, activeEnrollment, rolesInActiveProgram } = useSession();

  const { data, isPending } = useQuery({
    queryKey: ["stage-log-book", activeProgram.id, activeEnrollment.id],
    queryFn: async () => {
      const [templates, logs] = await Promise.all([
        dataAccess.stageLogs.listTemplates(activeProgram.id),
        dataAccess.stageLogs.listLogsForEnrollment(activeEnrollment.id),
      ]);
      return { templates, logs };
    },
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<readonly StageLogPhotoAttachment[]>([]);
  const [draftEntries, setDraftEntries] = useState<readonly StageLogEntry[]>([]);
  const [status, setStatus] = useState<StageLogStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const templates = useMemo(
    () =>
      templatesForContext(data?.templates ?? [], {
        programId: activeProgram.id,
        cohortId: activeEnrollment.cohortId,
      }),
    [data, activeProgram.id, activeEnrollment.cohortId],
  );

  const template: StageLogTemplate | undefined = templates[0];
  const log = data?.logs[0];
  const effectiveStatus = status ?? log?.status ?? "draft";

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  if (!template) {
    return (
      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit font-normal">
            Non applicable
          </Badge>
          <CardTitle className="text-base">Carnet de stage</CardTitle>
          <CardDescription>
            Aucun modèle de carnet n'est activé pour {activeProgram.name} et votre cohorte.
            L'administrateur du programme peut en activer un.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const entries = [...(log?.entries ?? []), ...draftEntries];
  const photoAllowed = isPhotoAllowed(template);

  const addEntry = () => {
    const entry: StageLogEntry = {
      id: `sle-local-${draftEntries.length + 1}`,
      createdAt: new Date().toISOString(),
      provenance: { sourceSystem: "native" },
      stageLogId: log?.id ?? "slog-local",
      templateId: template.id,
      occurredAt: new Date().toISOString(),
      values,
      photos,
    };
    if (!isEntryComplete(template, entry)) {
      setMessage("Entrée incomplète : renseignez tous les champs obligatoires du modèle.");
      return;
    }
    setDraftEntries((prev) => [...prev, entry]);
    setValues({});
    setPhotos([]);
    setStatus("draft");
    setMessage("Entrée ajoutée au brouillon local (aucun enregistrement réel).");
  };

  const submit = () => {
    const next = nextStageLogStatus(effectiveStatus, "submit", rolesInActiveProgram);
    if (!next) {
      setMessage("Ce carnet ne peut pas être soumis dans son état actuel.");
      return;
    }
    setStatus(next);
    setMessage(
      "Carnet soumis au responsable de stage (simulé). Après validation, il sera transmis dans l'espace sécurisé de l'administration du programme — jamais par e-mail.",
    );
  };

  return (
    <section className="space-y-6" aria-labelledby="titre-carnet">
      <SectionHeading
        id="titre-carnet"
        title="Mon carnet de stage"
        description={`${template.label} — version ${template.version} · ${template.moduleLabel}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-normal">
              Simulé
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {STAGE_LOG_STATUS_LABELS_FR[effectiveStatus]}
            </Badge>
          </div>
        }
      />

      <p
        role="note"
        className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {PHOTO_BANNER_FR}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saisie rapide</CardTitle>
          <CardDescription>
            Activité ou examen structuré. Aucun champ nominatif de patient n'existe dans ce
            formulaire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {template.fields.map((field) => {
              const id = `champ-${field.key}`;
              const value = values[field.key] ?? "";
              const set = (next: string) => setValues((prev) => ({ ...prev, [field.key]: next }));
              return (
                <div
                  key={field.key}
                  className={`space-y-1 ${field.kind === "long_text" ? "sm:col-span-2" : ""}`}
                >
                  <Label htmlFor={id}>
                    {field.label}
                    {field.required ? <span aria-hidden> *</span> : null}
                  </Label>
                  {field.kind === "long_text" ? (
                    <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} />
                  ) : field.options ? (
                    <Select value={value} onValueChange={set}>
                      <SelectTrigger id={id}>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      type={field.kind === "count" ? "number" : "text"}
                      min={field.kind === "count" ? 0 : undefined}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                  {field.helpText ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Photo d'un fragment autorisé</p>
            {photoAllowed ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Objet(s) autorisé(s) par l'administrateur :{" "}
                  {template.photoPolicy.allowedObjects.map((o) => o.label).join(" · ")}.
                </p>
                <ul className="space-y-2">
                  {photos.map((photo) => (
                    <li
                      key={photo.requirementId}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-sm"
                    >
                      <Badge variant="outline" className="font-normal">
                        placeholder
                      </Badge>
                      <span className="font-medium">{photo.requirementLabel}</span>
                      <span className="text-xs text-muted-foreground">{photo.placeholderName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ms-auto gap-1"
                        onClick={() =>
                          setPhotos((prev) =>
                            prev.filter((p) => p.requirementId !== photo.requirementId),
                          )
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Retirer / remplacer
                      </Button>
                    </li>
                  ))}
                </ul>
                <StageLogPhotoDialog
                  template={template}
                  currentPhotoCount={photos.length}
                  onAttach={(photo) =>
                    setPhotos((prev) => [
                      ...prev.filter((p) => p.requirementId !== photo.requirementId),
                      photo,
                    ])
                  }
                />
                <p className="text-xs text-muted-foreground">{PHOTO_NO_GUARANTEE_FR}</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageOff className="size-4" aria-hidden />
                Les photos ne sont pas autorisées par ce modèle de carnet.
              </p>
            )}
          </div>

          {message ? (
            <p role="status" className="rounded-md border border-border p-3 text-sm">
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={addEntry}>
              <ClipboardList className="size-4" aria-hidden />
              Ajouter au carnet (brouillon)
            </Button>
            <Button type="button" variant="secondary" className="gap-2" onClick={submit}>
              <Send className="size-4" aria-hidden />
              Soumettre au responsable de stage
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrées du carnet ({entries.length})</CardTitle>
          <CardDescription>
            Objectifs :{" "}
            {template.objectives.map((o) => `${o.label} — ${o.quota}`).join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {new Date(entry.occurredAt).toLocaleDateString("fr-FR")} —{" "}
                  {entry.values[template.fields[0]!.key] ?? "Entrée"}
                </p>
                <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {template.fields.map((field) => (
                    <div key={field.key} className="flex gap-2">
                      <dt className="text-muted-foreground">{field.label} :</dt>
                      <dd>{entry.values[field.key] || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {entry.photos.length > 0
                    ? `${entry.photos.length} fragment(s) joint(s) : ${entry.photos
                        .map((p) => p.requirementLabel)
                        .join(", ")} — aucune acquisition n'en est déduite.`
                    : "Aucune photo jointe."}
                </p>
              </li>
            ))}
            {entries.length === 0 ? (
              <li className="text-sm text-muted-foreground">Aucune entrée pour l'instant.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Règles de complétude du modèle</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
            {template.completenessRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
            <li>
              Aucune compétence réelle n'est acquise sans validation humaine : une photo ne vaut
              jamais preuve d'acquisition.
            </li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
