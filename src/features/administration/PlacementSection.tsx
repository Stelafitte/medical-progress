/**
 * Bloc UNIQUE des stages d'un programme — même format que les évaluations.
 *
 * Flux vertical : terrains existants et leur responsable → création d'un
 * terrain → éléments de validation (certificat au responsable, carnet de
 * stage) → association aux apprenants d'une cohorte → suivi des stages
 * (compétences, validation finale, réception du carnet).
 */
import { Check, CircleDashed, Lock, MapPin, Notebook, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, MockBadge, PanelCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { PlacementCreationForm } from "@/features/administration/PlacementCreationForm";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import {
  PLACEMENT_ASSIGNMENT_STATUS_FR,
  STAGE_STEP_STATE_FR,
  buildCohortPlacementRows,
  buildStageTrackingRows,
  supervisorNameFor,
  type StageTrackingStep,
} from "@/features/administration/placementSectionViewModel";
import { STAGE_VALIDATION_LABELS_FR, type LocalPlacement } from "@/domain/placementDraft";
import type { StageLogTemplate } from "@/domain/stageLog";
import type {
  Cohort,
  Enrollment,
  Person,
  Placement,
  PlacementAssignment,
  ProgramId,
} from "@/domain/types";

const STEP_ICONS: Record<StageTrackingStep["state"], typeof Check> = {
  done: Check,
  pending: CircleDashed,
  blocked: Lock,
};

const STEP_VARIANTS: Record<StageTrackingStep["state"], "secondary" | "outline" | "destructive"> = {
  done: "secondary",
  pending: "outline",
  blocked: "destructive",
};

export function PlacementSection({
  programId,
  programName,
  placements,
  localPlacements,
  assignments,
  enrollments,
  people,
  cohorts,
  templates,
  competencesExpected,
  cohortId,
  onCohortChange,
  showCohortSelector = true,
}: {
  readonly programId: ProgramId;
  readonly programName: string;
  readonly placements: readonly Placement[];
  readonly localPlacements: readonly LocalPlacement[];
  readonly assignments: readonly PlacementAssignment[];
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly cohorts: readonly Cohort[];
  readonly templates: readonly StageLogTemplate[];
  readonly competencesExpected: number;
  readonly cohortId: string | undefined;
  readonly onCohortChange?: (cohortId: string) => void;
  readonly showCohortSelector?: boolean;
}) {
  const cohortLabel = cohorts.find((c) => c.id === cohortId)?.label ?? "cohorte";
  const logbookTemplates = templates.filter(
    (template) =>
      template.programId === programId &&
      template.enabled &&
      (template.cohortIds.length === 0 ||
        (cohortId ? template.cohortIds.includes(cohortId as never) : true)),
  );
  const logbookExpected = logbookTemplates.length > 0;

  const rows = cohortId
    ? buildCohortPlacementRows({ cohortId, enrollments, people, placements, assignments })
    : [];
  const associated = rows.filter((row) => row.placementName !== null);
  const toAssociate = rows.filter((row) => row.placementName === null);
  const tracking = buildStageTrackingRows({
    rows,
    competencesExpected,
    logbookExpected,
  });

  return (
    <div className="space-y-6">
      <PanelCard
        title="Stages existants et responsables"
        description="Ce qui existe déjà pour ce programme : terrain, service, lieu, capacité d'accueil et responsable de stage."
        action={<MockBadge />}
      >
        {placements.length === 0 ? (
          <EmptyState>Aucun terrain de stage déclaré pour ce programme.</EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {placements.map((placement) => {
              const local = localPlacements.find((l) => l.placement.id === placement.id);
              const supervisor = supervisorNameFor(placement, localPlacements, assignments, people);
              return (
                <li key={placement.id} className="border-border rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{placement.name}</strong>
                    <Badge variant="outline">{placement.department}</Badge>
                    {local ? (
                      <Badge variant="secondary">
                        {STAGE_VALIDATION_LABELS_FR[local.validationMode]}
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground text-xs">Lieu</dt>
                      <dd>
                        <MapPin className="me-1 inline size-3" aria-hidden />
                        {placement.site}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Places d'accueil</dt>
                      <dd>{placement.capacity} place(s)</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Responsable de stage</dt>
                      <dd>{supervisor ?? "à rattacher"}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Créer un terrain de stage"
        description="Éléments administratifs du stage : nom, établissement, service, places d'accueil, responsable et mode de validation."
        action={<MockBadge />}
      >
        <PlacementCreationForm
          programId={programId}
          idPrefix="stage-section"
          submitLabel="Créer le terrain de stage"
          hint="Le terrain rejoint la liste unique : il est aussitôt proposé dans le « Concepteur de programme » et dans le pilotage."
        />
      </PanelCard>

      <PanelCard
        title="Éléments de validation du stage"
        description="Ce qui est envoyé au responsable de stage et ce qui doit revenir pour considérer le stage accompli."
        action={<MockBadge />}
      >
        <ul className="grid gap-3 md:grid-cols-2">
          <li className="border-border rounded-md border p-4">
            <Send className="text-muted-foreground size-4" aria-hidden />
            <p className="mt-2 text-sm font-medium">Certificat à envoyer au responsable de stage</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Attestation d'accueil et grille de validation adressées au responsable pour
              contresignature, programme {programName}.
            </p>
            <Button size="sm" variant="outline" className="mt-3 min-h-11">
              Préparer l'envoi (simulé)
            </Button>
          </li>
          <li className="border-border rounded-md border p-4">
            <Notebook className="text-muted-foreground size-4" aria-hidden />
            <p className="mt-2 text-sm font-medium">Carnet de stage</p>
            {logbookExpected ? (
              <>
                <p className="text-muted-foreground mt-1 text-xs">
                  Carnet prévu par le Concepteur de programme :{" "}
                  {logbookTemplates.map((template) => template.label).join(" · ")}.
                </p>
                <Badge variant="secondary" className="mt-3 font-normal">
                  Réception attendue en fin de stage
                </Badge>
              </>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                Aucun modèle de carnet activé pour ce programme : la réception du carnet n'est pas
                exigée dans le suivi.
              </p>
            )}
          </li>
        </ul>
      </PanelCard>

      {showCohortSelector && onCohortChange ? (
        <CohortSelector
          cohorts={cohorts}
          value={cohortId}
          onChange={onCohortChange}
          label="Cohorte concernée par les stages"
        />
      ) : null}

      <PanelCard
        title={`Association aux apprenants — ${cohortLabel}`}
        description="Un programme peut compter plusieurs cohortes. L'association terrain / apprenant se fait cohorte par cohorte."
        action={<MockBadge />}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal">
            <Users className="me-1 inline size-3" aria-hidden />
            {associated.length} association(s) faite(s)
          </Badge>
          <Badge variant="outline" className="font-normal">
            {toAssociate.length} apprenant(s) à associer
          </Badge>
        </div>
        {rows.length === 0 ? (
          <EmptyState>Aucun apprenant inscrit dans cette cohorte.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((row) => (
              <li
                key={row.enrollmentId}
                className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                <span className="font-medium">{row.learnerName}</span>
                {row.placementName ? (
                  <>
                    <Badge variant="outline" className="font-normal">
                      {row.placementName}
                    </Badge>
                    <Badge variant="secondary" className="font-normal">
                      {row.status ? PLACEMENT_ASSIGNMENT_STATUS_FR[row.status] : ""}
                    </Badge>
                    {row.startsOn && row.endsOn ? (
                      <span className="text-muted-foreground text-xs">
                        {formatFrDate(row.startsOn)} → {formatFrDate(row.endsOn)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="font-normal">
                      À associer
                    </Badge>
                    <Button size="sm" variant="outline" className="min-h-11">
                      Associer à un terrain (simulé)
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title={`Suivi des stages — ${cohortLabel}`}
        description="Étapes reliées : validation des compétences réelles par l'encadrant, validation finale humaine, puis réception du carnet lorsqu'il est prévu."
        action={<MockBadge />}
      >
        {tracking.length === 0 ? (
          <EmptyState>Aucun stage associé à suivre pour cette cohorte.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {tracking.map((row) => (
              <li key={row.enrollmentId} className="border-border rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{row.learnerName}</strong>
                  <Badge variant="outline" className="font-normal">
                    {row.placementName}
                  </Badge>
                </div>
                <ol className="mt-3 space-y-2">
                  {row.steps.map((step) => {
                    const Icon = STEP_ICONS[step.state];
                    return (
                      <li key={step.label} className="flex flex-wrap items-center gap-2 text-sm">
                        <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                        <span>{step.label}</span>
                        <Badge variant={STEP_VARIANTS[step.state]} className="font-normal">
                          {STAGE_STEP_STATE_FR[step.state]}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{step.detail}</span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
