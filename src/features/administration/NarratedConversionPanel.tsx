/**
 * Fiche de conversion d'un PowerPoint sonorisé (MAQUETTE).
 * Aucun fichier n'est lu, converti, stocké ni transmis : le panneau n'affiche
 * que des métadonnées et des actions simulées.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CONVERSION_ALERT_LABELS_FR,
  CONVERSION_PIPELINE,
  CONVERSION_STATUS_LABELS_FR,
  CONVERSION_STATUS_PROGRESS,
  CONVERSION_STEP_LABELS_FR,
  CONVERSION_STEP_STATE_LABELS_FR,
  CONVERSION_TARGET_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  NARRATED_ACTION_LABELS_FR,
  NARRATED_HUMAN_REVIEW_FR,
  NARRATED_SOURCE_RESTRICTION_FR,
  availableNarratedActions,
  formatPlayerDuration,
  type NarratedDeck,
} from "@/domain/mediaLibrary";

const ARTIFACT_STATE_FR = {
  draft: "brouillon",
  ready: "prêt",
  published: "publié",
} as const;

const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function NarratedConversionPanel({
  deck,
  onAction,
}: {
  deck: NarratedDeck;
  onAction: (label: string) => void;
}) {
  const progress = CONVERSION_STATUS_PROGRESS[deck.conversionStatus];
  const stepState = (step: (typeof CONVERSION_PIPELINE)[number]) =>
    deck.steps.find((entry) => entry.step === step);

  return (
    <section className="space-y-4 rounded-md border border-border p-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Conversion en lecteur web HTML5</p>
          <Badge variant="secondary" className="font-normal">
            {CONVERSION_STATUS_LABELS_FR[deck.conversionStatus]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {CONVERSION_TARGET_LABELS_FR[deck.target]}
          </Badge>
        </div>
        <Progress value={progress} aria-label="Avancement simulé de la conversion" />
        <p className="text-xs text-muted-foreground">
          Avancement simulé : {progress} %. {MEDIA_STORAGE_NOTICE_FR}.
        </p>
      </div>

      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Fichier source</dt>
          <dd className="break-all">
            {deck.source.fileName}
            <span className="block text-xs text-muted-foreground">
              Accès équipe pédagogique uniquement
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Résultat web</dt>
          <dd>{deck.artifact ? ARTIFACT_STATE_FR[deck.artifact.state] : "non généré"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Diapositives</dt>
          <dd>{deck.artifact?.slideCount ?? deck.precheck.slideCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Durée audio</dt>
          <dd>
            {deck.artifact
              ? formatPlayerDuration(deck.artifact.totalDurationSeconds)
              : `≈ ${deck.precheck.estimatedDurationMinutes} min`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Transcription</dt>
          <dd>
            {deck.artifact?.hasTranscript
              ? deck.options.exposeTranscriptToLearners
                ? "disponible, visible par les apprenants"
                : "disponible, masquée aux apprenants"
              : "absente"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Chapitres</dt>
          <dd>{deck.artifact?.chapters.length ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Déposé le</dt>
          <dd>{formatDateTime(deck.source.uploadedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">MP4 de secours</dt>
          <dd>{deck.artifact?.mp4Fallback ? "généré (optionnel)" : "non demandé"}</dd>
        </div>
      </dl>

      {deck.alerts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Alertes de conversion</p>
          <ul className="flex flex-wrap gap-1.5">
            {deck.alerts.map((alert) => (
              <li key={alert}>
                <Badge variant="outline" className="font-normal">
                  {CONVERSION_ALERT_LABELS_FR[alert]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Journal des étapes</p>
        <ol className="space-y-1 text-sm">
          {CONVERSION_PIPELINE.map((step) => {
            const entry = stepState(step);
            return (
              <li key={step} className="flex flex-wrap items-baseline gap-2">
                <span>{CONVERSION_STEP_LABELS_FR[step]}</span>
                <Badge variant="outline" className="font-normal">
                  {CONVERSION_STEP_STATE_LABELS_FR[entry?.state ?? "pending"]}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(entry?.at)}</span>
                {entry?.note ? (
                  <span className="w-full text-xs text-muted-foreground">{entry.note}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {availableNarratedActions(deck).map((action) => (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 w-full sm:w-auto"
            onClick={() =>
              onAction(
                `Action simulée : ${NARRATED_ACTION_LABELS_FR[action]}. Aucun fichier converti ni transmis.`,
              )
            }
          >
            {NARRATED_ACTION_LABELS_FR[action]}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {NARRATED_SOURCE_RESTRICTION_FR}. {NARRATED_HUMAN_REVIEW_FR}. Le téléchargement du PPTX
        n'est jamais proposé dans la vue apprenant.
      </p>
    </section>
  );
}
