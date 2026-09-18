/**
 * « Gestion des stages » — la page, dans l'ordre où on la lit.
 *
 * 1. les terrains de stage, et leur création ;
 * 2. les promotions concernées, AFFICHÉES D'EMBLÉE — pas derrière un menu
 *    déroulant : on doit voir d'un coup d'œil quelles promotions font ce stage
 *    et où elles en sont ;
 * 3. l'encadrement de la promotion choisie (inséré par l'écran appelant) ;
 * 4. les apprenants de cette promotion, et leur rattachement réel au groupe ;
 * 5. le suivi, construit sur les carnets réels ;
 * 6. en dernier, les éléments de validation, qui restent une maquette.
 *
 * Ce qui a été retiré le 07/09, et pourquoi : le bouton « Associer à un terrain
 * (simulé) » n'associait rien — il n'existe aucune table d'affectation, le
 * rattachement passe par les GROUPES d'encadrement. Et le suivi fabriquait sa
 * progression à partir d'un hachage de l'identifiant de l'inscription : des
 * compétences « contresignées » qui n'avaient jamais existé.
 */
import type { ReactNode } from "react";
import { Check, MapPin, Notebook, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { PlacementCreationForm } from "@/features/administration/PlacementCreationForm";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { StageLog, StageLogTemplate } from "@/domain/stageLog";
import type {
  Cohort,
  Enrollment,
  EnrollmentId,
  Person,
  Placement,
  ProgramId,
  SupervisionGroup,
} from "@/domain/types";

export function PlacementSection({
  programId,
  programName,
  placements,
  enrollments,
  people,
  cohorts,
  groups,
  stageLogs,
  templates,
  cohortId,
  onCohortChange,
  onChanged,
  supervisionSlot,
  showCreation = true,
}: {
  readonly programId: ProgramId;
  readonly programName: string;
  readonly placements: readonly Placement[];
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly cohorts: readonly Cohort[];
  readonly groups: readonly SupervisionGroup[];
  readonly stageLogs: readonly StageLog[];
  readonly templates: readonly StageLogTemplate[];
  readonly cohortId: string | undefined;
  readonly onCohortChange?: (cohortId: string) => void;
  readonly onChanged?: () => void;
  /** L'encadrement de la promotion, inséré juste après le choix de celle-ci. */
  readonly supervisionSlot?: ReactNode;
  /** `false` dans le pilotage : le terrain se crée dans « Gestion des stages ». */
  readonly showCreation?: boolean;
}) {
  const cohort = cohorts.find((c) => c.id === cohortId);
  const cohortLabel = cohort?.label ?? "promotion";
  const group = groups.find((g) => g.cohortId === cohortId);
  const inscrits = enrollments.filter((e) => e.cohortId === cohortId);

  const logbookTemplates = templates.filter(
    (template) => template.programId === programId && template.enabled,
  );

  const nameOf = (enrollment: Enrollment) =>
    people.find((p) => p.id === enrollment.personId)?.fullName ?? "Apprenant";

  const logOf = (enrollment: Enrollment) =>
    stageLogs.find((log) => log.enrollmentId === enrollment.id);

  return (
    <div className="space-y-6">
      <PanelCard
        title="Terrains de stage"
        description="Les terrains de ce programme : service, lieu et capacité d'accueil. Les encadrants ne se règlent pas ici mais promotion par promotion, plus bas."
      >
        {placements.length === 0 ? (
          <EmptyState>Aucun terrain de stage déclaré pour ce programme.</EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {placements.map((placement) => {
              const groupsHere = groups.filter((g) => g.placementId === placement.id);
              return (
                <li key={placement.id} className="border-border rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{placement.name}</strong>
                    <Badge variant="outline">{placement.department}</Badge>
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
                      <dt className="text-muted-foreground text-xs">Promotions rattachées</dt>
                      <dd>{groupsHere.length === 0 ? "aucune" : groupsHere.length}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      {showCreation ? (
        <PanelCard
          title="Créer un terrain de stage"
          description="Nom, établissement, service et places d'accueil. L'enregistrement est réel."
        >
          <PlacementCreationForm
            programId={programId}
            idPrefix="stage-section"
            submitLabel="Créer le terrain de stage"
            hint="Le terrain rejoint la liste unique : il est aussitôt proposé dans le « Concepteur de programme » et dans le pilotage."
            onCreated={() => onChanged?.()}
          />
        </PanelCard>
      ) : null}

      <PanelCard
        title="Promotions concernées par le stage"
        description="Toutes les promotions du programme, avec leur période, leurs inscrits et leur rattachement à un terrain. Choisissez celle sur laquelle vous voulez travailler."
      >
        {cohorts.length === 0 ? (
          <EmptyState>Aucune promotion dans ce programme.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {cohorts.map((item) => {
              const itsGroup = groups.find((g) => g.cohortId === item.id);
              const count = enrollments.filter((e) => e.cohortId === item.id).length;
              const selected = item.id === cohortId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={selected}
                    disabled={!onCohortChange}
                    onClick={() => onCohortChange?.(item.id)}
                    className={`border-border w-full rounded-lg border p-4 text-start ${
                      selected ? "bg-accent border-primary" : ""
                    } ${onCohortChange ? "hover:bg-accent" : ""}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{item.label}</strong>
                      {selected ? <Badge variant="secondary">Sélectionnée</Badge> : null}
                      {itsGroup ? (
                        <Badge variant="outline" className="font-normal">
                          Rattachée à un terrain
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          Pas encore rattachée
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {formatFrDate(item.startsOn)} → {formatFrDate(item.endsOn)} · {count}{" "}
                      inscrit(s)
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      {supervisionSlot}

      <PanelCard
        title={`Apprenants de la promotion — ${cohortLabel}`}
        description="Qui est rattaché au groupe d'encadrement, et où en est son carnet. Le rattachement se fait en un geste depuis « Groupes d'encadrement : qui encadre qui »."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal">
            <Users className="me-1 inline size-3" aria-hidden />
            {group ? group.memberEnrollmentIds.length : 0} rattaché(s)
          </Badge>
          <Badge variant="outline" className="font-normal">
            {inscrits.length} inscrit(s) dans la promotion
          </Badge>
        </div>
        {inscrits.length === 0 ? (
          <EmptyState>
            Aucun inscrit dans cette promotion. Une personne importée n'est pas inscrite tant
            qu'elle n'a pas été invitée puis connectée.
          </EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {inscrits.map((enrollment) => {
              const attached = group?.memberEnrollmentIds.includes(enrollment.id as EnrollmentId);
              const log = logOf(enrollment);
              return (
                <li
                  key={enrollment.id}
                  className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-4"
                >
                  <span className="font-medium">{nameOf(enrollment)}</span>
                  {attached ? (
                    <Badge variant="secondary" className="font-normal">
                      <Check className="me-1 inline size-3" aria-hidden />
                      Dans le groupe
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      Pas encore rattaché
                    </Badge>
                  )}
                  {log ? (
                    <span className="text-muted-foreground text-xs">
                      {log.entries.length} journée(s) déclarée(s)
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Carnet non ouvert</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title={`Suivi des stages — ${cohortLabel}`}
        description="Construit sur les carnets réels : journées déclarées et périodes contresignées par l'encadrant."
      >
        {inscrits.length === 0 ? (
          <EmptyState>Aucun apprenant à suivre pour cette promotion.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {inscrits.map((enrollment) => {
              const log = logOf(enrollment);
              const validations = log?.validations ?? [];
              const accepted = validations.filter((v) => v.decision === "validated");
              const revisions = validations.filter((v) => v.decision === "needs_revision");
              return (
                <li key={enrollment.id} className="border-border rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{nameOf(enrollment)}</strong>
                    {log ? null : (
                      <Badge variant="outline" className="font-normal">
                        Carnet non ouvert
                      </Badge>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground text-xs">Journées déclarées</dt>
                      <dd>{log?.entries.length ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Périodes validées</dt>
                      <dd>
                        {accepted.length === 0
                          ? "aucune"
                          : `${accepted.length} · jusqu'au ${formatFrDate(
                              accepted.reduce((a, b) => (b.coversTo > a.coversTo ? b : a)).coversTo,
                            )}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Corrections demandées</dt>
                      <dd>{revisions.length === 0 ? "aucune" : revisions.length}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Éléments de validation du stage"
        description="Ce qui est envoyé au responsable de stage et ce qui doit revenir. Cette partie n'est pas encore branchée."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          <li className="border-border rounded-md border p-4">
            <Send className="text-muted-foreground size-4" aria-hidden />
            <p className="mt-2 text-sm font-medium">Certificat à envoyer au responsable de stage</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Attestation d'accueil et grille de validation adressées au responsable pour
              contresignature, programme {programName}.
            </p>
            <Button size="sm" variant="outline" className="mt-3 min-h-11" disabled>
              Préparer l'envoi (non branché)
            </Button>
          </li>
          <li className="border-border rounded-md border p-4">
            <Notebook className="text-muted-foreground size-4" aria-hidden />
            <p className="mt-2 text-sm font-medium">Modèle de carnet de stage</p>
            {logbookTemplates.length > 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Modèle prévu par le Concepteur de programme :{" "}
                {logbookTemplates.map((template) => template.label).join(" · ")}.
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                Aucun modèle de carnet configuré. Le carnet fonctionne sans : présence, récit libre
                et validation par période sont le socle commun.
              </p>
            )}
          </li>
        </ul>
      </PanelCard>
    </div>
  );
}
