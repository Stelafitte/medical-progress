/**
 * Bloc UNIQUE des évaluations d'un programme.
 *
 * Même contenu dans l'onglet « Évaluations » et dans la partie Évaluation du
 * pilotage de programme : modalités existantes, création d'une modalité,
 * import de résultats externes, puis résultats par cohorte (passés et à venir).
 */
import { useState } from "react";
import { CalendarClock, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_RESULT_IMPORT_COLUMNS,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  mergeModalities,
  splitSessions,
  type AssessmentModality,
  type AssessmentSession,
} from "@/domain/assessmentModality";
import { useLocalModalities } from "@/application/assessmentModalityStore";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import {
  modalityFixturesFor,
  sessionFixturesFor,
} from "@/infrastructure/mock/assessmentModalityFixtures";
import type { Cohort, ProgramId } from "@/domain/types";

function ModalityCard({ modality }: { modality: AssessmentModality }) {
  return (
    <li className="border-border rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{modality.name}</strong>
        <Badge variant="outline">{ASSESSMENT_MODE_LABELS_FR[modality.mode]}</Badge>
        <Badge variant="secondary">{ASSESSMENT_SUBTYPE_LABELS_FR[modality.subtype]}</Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">Utilisation</dt>
          <dd>{ASSESSMENT_USAGE_LABELS_FR[modality.usage]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Créée le</dt>
          <dd>{formatFrDate(modality.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Mise à jour le</dt>
          <dd>{formatFrDate(modality.updatedAt)}</dd>
        </div>
      </dl>
      {modality.notes ? (
        <p className="text-muted-foreground mt-2 text-xs">{modality.notes}</p>
      ) : null}
    </li>
  );
}

function SessionRow({
  session,
  modalities,
  completed,
}: {
  session: AssessmentSession;
  modalities: readonly AssessmentModality[];
  completed: boolean;
}) {
  const modality = modalities.find((m) => m.id === session.modalityId);
  return (
    <li className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <CalendarClock className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="font-mono text-xs">{formatFrDate(session.scheduledFor)}</span>
      <span className="font-medium">{modality?.name ?? session.modalityId}</span>
      <Badge variant="outline" className="font-normal">
        {session.participants} apprenant(s)
      </Badge>
      {completed ? (
        <>
          <Badge variant="secondary" className="font-normal">
            Moyenne {session.averageScore}/{session.maximumScore}
          </Badge>
          <Badge variant="secondary" className="font-normal">
            {session.passRatePercent} % de réussite
          </Badge>
        </>
      ) : (
        <Badge variant="outline" className="font-normal">
          À venir
        </Badge>
      )}
    </li>
  );
}

export function AssessmentModalitySection({
  programId,
  cohorts,
  cohortId,
  onCohortChange,
  showCohortSelector = true,
  showCreation = true,
}: {
  readonly programId: ProgramId;
  readonly cohorts: readonly Cohort[];
  readonly cohortId: string | undefined;
  readonly onCohortChange?: (cohortId: string) => void;
  readonly showCohortSelector?: boolean;
  /** `false` dans le pilotage : les modalités se créent dans « Évaluations ». */
  readonly showCreation?: boolean;
}) {
  const [importText, setImportText] = useState("");
  const local = useLocalModalities(programId);
  const modalities = mergeModalities(modalityFixturesFor(programId), local);

  const sessions = cohortId ? sessionFixturesFor(programId, cohortId) : [];
  const { completed, upcoming } = splitSessions(sessions, new Date());
  const cohortLabel = cohorts.find((c) => c.id === cohortId)?.label ?? "cohorte";

  const importedRows = importText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.toLowerCase().startsWith("learner"));

  return (
    <div className="space-y-6">
      <PanelCard
        title="Modalités d'évaluation du programme"
        description="Ce qui existe déjà pour ce programme : type, sous-type, usage prévu et dates."
        action={<MockBadge />}
      >
        {modalities.length === 0 ? (
          <EmptyState>Aucune modalité d'évaluation définie pour ce programme.</EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {modalities.map((modality) => (
              <ModalityCard key={modality.id} modality={modality} />
            ))}
          </ul>
        )}
      </PanelCard>

      {showCreation ? (
      <PanelCard
        title="Créer une modalité d'évaluation"
        description="Nom, type (présentiel ou en ligne), sous-type et usage prévu."
        action={<MockBadge />}
      >
        <AssessmentModalityForm
          programId={programId}
          hint="La modalité créée apparaît immédiatement ci-dessus et dans la partie Évaluation du pilotage de programme."
        />
      </PanelCard>
      ) : null}

      <PanelCard
        title="Importation des résultats externes"
        description="Résultats obtenus hors plateforme : prévisualisation, correspondance des colonnes puis contrôle des inscrits."
        action={<FileUp className="text-primary size-5" aria-hidden />}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {ASSESSMENT_RESULT_IMPORT_COLUMNS.map((column) => (
            <Badge key={column} variant="outline" className="font-mono text-[10px]">
              {column}
            </Badge>
          ))}
        </div>
        <Textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={5}
          placeholder="learner_identifier;modality;score;maximum_score;result_status"
          aria-label="Résultats à importer"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{importedRows.length} ligne(s) reconnue(s)</Badge>
          <Button size="sm" className="min-h-11" disabled={importedRows.length === 0}>
            Importer les résultats (simulé)
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Formats prévus : CSV, TSV et XLSX. Aucun fichier n'est envoyé dans cette maquette.
        </p>
      </PanelCard>

      {showCohortSelector && onCohortChange ? (
        <CohortSelector
          cohorts={cohorts}
          value={cohortId}
          onChange={onCohortChange}
          label="Cohorte évaluée"
        />
      ) : null}

      <PanelCard
        title={`Évaluations réalisées — ${cohortLabel}`}
        description="Sessions passées de cette cohorte, avec moyenne et taux de réussite."
        action={<MockBadge />}
      >
        {completed.length === 0 ? (
          <EmptyState>Aucune évaluation réalisée pour cette cohorte.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {completed.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                modalities={modalities}
                completed
              />
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title={`Évaluations à venir — ${cohortLabel}`}
        description="Sessions programmées et non encore passées."
        action={<MockBadge />}
      >
        {upcoming.length === 0 ? (
          <EmptyState>Aucune évaluation à venir pour cette cohorte.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                modalities={modalities}
                completed={false}
              />
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
