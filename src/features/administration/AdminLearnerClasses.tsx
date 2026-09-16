/**
 * « Classes d'apprenants » — les promotions du programme.
 * Une classe est une cohorte : elle peut être créée manuellement ou importée,
 * reprise, archivée, et plusieurs classes peuvent vivre en parallèle sur le
 * même programme.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortRosterSection } from "@/features/administration/CohortRosterSection";
import { LearnerTrackingSection } from "@/features/administration/LearnerTrackingSection";
import { RealRosterImportPanel } from "@/features/administration/RealRosterImportPanel";
import { PendingPeopleTable } from "@/features/administration/PendingPeopleTable";
import { RealIndividualPersonForm } from "@/features/administration/RealIndividualPersonForm";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { useDataAccess } from "@/application/session";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";
import { CohortForm } from "@/features/administration/CohortForm";
import type { Cohort, CohortId } from "@/domain/types";
import type { PendingPersonId, UpdatePendingPersonInput } from "@/domain/peopleStaging";

export function AdminLearnerClasses() {
  const { data, isPending, error, refetch } = useProgramAdmin();
  const dataAccess = useDataAccess();
  const [editing, setEditing] = useState<CohortId | null>(null);
  const [importingInto, setImportingInto] = useState<CohortId | null>(null);
  const [openRoster, setOpenRoster] = useState<CohortId | null>(null);
  const [personBusyId, setPersonBusyId] = useState<PendingPersonId | null>(null);
  const [busy, setBusy] = useState<CohortId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Les classes archivées sont demandées à PART, et seulement ici : partout
   * ailleurs `listCohorts` ne rend que les actives. Sans cette seconde lecture,
   * archiver une classe la rendrait irrécupérable par l'interface.
   */
  const archivedQuery = useQuery({
    queryKey: ["cohorts-archived", data?.program?.id],
    enabled: Boolean(data?.program?.id),
    queryFn: async () => {
      const all = await dataAccess.programs.listCohorts(data!.program!.id, {
        includeArchived: true,
      });
      return all.filter((c) => Boolean(c.archivedAt));
    },
  });

  /**
   * Les personnes du SAS, pas les inscriptions : ce sont elles qu'on corrige,
   * retire et ajoute avant la première connexion. `useProgramAdmin` rend des
   * comptes déjà activés, ce qui n'est pas la même population — les 17
   * étudiants importés le 01/09 n'y figurent pas.
   */
  const pendingQuery = useQuery({
    queryKey: ["pending-people", data?.program?.id],
    enabled: Boolean(data?.program?.id),
    queryFn: () => dataAccess.peopleStaging.listPendingPeople(data!.program!.id),
  });

  if (isPending || !data) return <AdminChargement error={error} />;

  const cohorts = sortCohortsForPilot(data.cohorts);
  const running = cohorts.filter((c) => cohortPhase(c) === "running").length;
  const planned = cohorts.filter((c) => cohortPhase(c) === "planned").length;
  const archived = archivedQuery.data ?? [];

  async function updatePerson(input: UpdatePendingPersonInput) {
    setActionError(null);
    setPersonBusyId(input.personId);
    try {
      await dataAccess.peopleStaging.updatePendingPerson(input);
      await pendingQuery.refetch();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Modification impossible.");
    } finally {
      setPersonBusyId(null);
    }
  }

  async function setPersonCancelled(personId: PendingPersonId, cancelled: boolean) {
    setActionError(null);
    setPersonBusyId(personId);
    try {
      await dataAccess.peopleStaging.setPendingPersonCancelled(personId, cancelled);
      await pendingQuery.refetch();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally {
      setPersonBusyId(null);
    }
  }

  async function setArchived(cohort: Cohort, value: boolean) {
    setActionError(null);
    setBusy(cohort.id);
    try {
      await dataAccess.programs.setCohortArchived(cohort.id, value);
      await Promise.all([refetch(), archivedQuery.refetch()]);
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "L'opération sur la classe a échoué.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={data.program?.name ?? "Programme"}
        title="Classes d'apprenants"
        level={1}
        action={<MockBadge />}
        description="Promotions du programme, effectifs, périodes et import des listes d'apprenants."
      />

      <ScopeNotice>
        Cet onglet est celui de la <strong>composition</strong> : qui est inscrit, dans quelle
        classe, sur quelle période, avec quels imports et quels archivages. L'avancement pédagogique
        et les relances ne se traitent pas ici mais dans « Pilotage de programme ».
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Classes du programme" value={cohorts.length} />
        <StatCard label="Classes en cours" value={running} />
        <StatCard label="Classes à venir" value={planned} />
        <StatCard label="Inscriptions actives" value={data.enrollments.length} />
      </div>

      {actionError ? (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
          {actionError}
        </p>
      ) : null}

      <PanelCard
        title="Classes existantes"
        description="Composition de chaque classe. Le suivi de son avancement s'ouvre dans « Pilotage de programme »."
      >
        {cohorts.length === 0 ? (
          <EmptyState>Aucune classe rattachée à ce programme.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {cohorts.map((cohort) => {
              const enrolled = data.enrollments.filter((e) => e.cohortId === cohort.id).length;
              const isEditing = editing === cohort.id;
              const isImporting = importingInto === cohort.id;
              return (
                <li key={cohort.id} className="border-border space-y-2 rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{cohort.label}</span>
                    <Badge variant="outline" className="font-normal">
                      {COHORT_PHASE_LABELS_FR[cohortPhase(cohort)]}
                    </Badge>
                    <span className="text-muted-foreground text-sm">
                      {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      · {enrolled} inscription(s) sur {cohort.learnerCount} attendues
                    </span>
                  </div>
                  <Progress value={Math.round(cohortProgressRatio(cohort) * 100)} />

                  {isEditing && data.program && data.versions[0] ? (
                    <div className="bg-muted/30 rounded-md border border-dashed p-4">
                      <CohortForm
                        idPrefix={`edit-${cohort.id}`}
                        programId={data.program.id}
                        curriculumVersionId={cohort.curriculumVersionId}
                        cohort={cohort}
                        submitLabel="Enregistrer les modifications"
                        hint="Le programme et la version de curriculum d'une classe ne se changent pas : déplacer une classe laisserait ses inscriptions, ses jalons et ses carnets rattachés à l'ancien programme."
                        onCreated={() => {
                          setEditing(null);
                          void refetch();
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ) : null}

                  {/*
                    L'import monté SOUS la classe : c'est là que Stef l'a cherché,
                    et c'est le geste naturel — « ajouter des étudiants à cette
                    promotion », pas « créer une classe ». Même composant que le
                    bloc général, avec la destination déjà choisie : un seul
                    import, deux points de montage.
                  */}
                  {isImporting && data.program ? (
                    <div className="bg-muted/30 rounded-md border border-dashed p-4">
                      <RealRosterImportPanel
                        idPrefix={`roster-${cohort.id}`}
                        programId={data.program.id}
                        cohorts={[cohort]}
                        defaultCohortId={cohort.id}
                        lockCohort
                        title={`Importer une liste dans « ${cohort.label} »`}
                        existingEmails={data.people.map((p) => p.email)}
                        onImported={() => void refetch()}
                      />
                    </div>
                  ) : null}

                  {/*
                    La COMPOSITION de la classe, dépliée sous elle : la liste
                    des personnes du sas rattachées à cette promotion, le même
                    tableau que l'onglet « Personnes et inscriptions » — sans sa
                    colonne Promotion, qui ne dirait qu'une chose ici.
                  */}
                  {openRoster === cohort.id ? (
                    <div className="bg-muted/30 space-y-4 rounded-md border border-dashed p-4">
                      <PendingPeopleTable
                        people={(pendingQuery.data ?? []).filter(
                          (person) => person.intendedCohortId === cohort.id,
                        )}
                        cohorts={cohorts}
                        showCohortColumn={false}
                        busyId={personBusyId}
                        onUpdate={updatePerson}
                        onSetCancelled={setPersonCancelled}
                      />
                      {/*
                        `existingPeople` reçoit TOUTES les personnes du
                        programme, pas celles de la classe : l'adresse d'un
                        étudiant d'une autre promotion — ou d'un étudiant retiré
                        — occupe la place tout autant, et c'est la base qui
                        refuserait, avec un message que personne ne comprend.
                      */}
                      {data.program ? (
                        <RealIndividualPersonForm
                          programId={data.program.id}
                          cohorts={[cohort]}
                          defaultCohortId={cohort.id}
                          existingPeople={pendingQuery.data ?? []}
                          lockCohort
                          idPrefix={`add-${cohort.id}`}
                          title={`Ajouter un apprenant à « ${cohort.label} »`}
                          onCreated={() => void pendingQuery.refetch()}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setOpenRoster(openRoster === cohort.id ? null : cohort.id)}
                    >
                      {openRoster === cohort.id
                        ? "Fermer la composition"
                        : `Voir la composition (${(pendingQuery.data ?? []).filter((p) => p.intendedCohortId === cohort.id).length})`}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setEditing(isEditing ? null : cohort.id)}
                    >
                      {isEditing ? "Fermer" : "Modifier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setImportingInto(isImporting ? null : cohort.id)}
                    >
                      {isImporting ? "Fermer l'import" : "Importer une liste"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy === cohort.id}
                      onClick={() => void setArchived(cohort, true)}
                    >
                      {busy === cohort.id ? "…" : "Archiver"}
                    </Button>
                    {/* Lien croisé : le suivi s'ouvre directement sur cette promotion. */}
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link to="/espace/administration/pilotage" search={{ promotion: cohort.id }}>
                        Suivre cette promotion
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link to="/espace/administration/personnes">Gérer les personnes</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      {archived.length > 0 ? (
        <PanelCard
          title="Classes archivées"
          description="Sorties des listes actives, sans perte : leurs inscriptions, jalons et carnets de stage restent rattachés. Une classe archivée se désarchive."
        >
          <ul className="space-y-2">
            {archived.map((cohort) => (
              <li
                key={cohort.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-4"
              >
                <span className="font-medium">{cohort.label}</span>
                <span className="text-muted-foreground text-sm">
                  {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy === cohort.id}
                  onClick={() => void setArchived(cohort, false)}
                >
                  {busy === cohort.id ? "…" : "Désarchiver"}
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}

      <PanelCard
        title="Créer une classe"
        description="Deux façons de créer une classe : la saisie manuelle, ou l'import d'une liste d'étudiants. Une classe créée ici est immédiatement disponible dans le « Concepteur de programme »."
      >
        {data.program ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Saisie manuelle</h3>
                <p className="text-muted-foreground text-xs">
                  Renseignez le nom de la classe et sa période.
                </p>
              </div>
              {data.versions[0] ? (
                <CohortForm
                  idPrefix="classes-cohort"
                  programId={data.program.id}
                  curriculumVersionId={data.versions[0].id}
                  submitLabel="Créer la classe"
                  hint="Classe créée indépendamment d'une conception en cours : elle sera proposée dans le concepteur au moment d'associer une promotion."
                  onCreated={() => void refetch()}
                />
              ) : (
                <EmptyState>
                  Aucune version de curriculum pour ce programme : une classe ne peut pas encore
                  être créée.
                </EmptyState>
              )}
            </div>

            {/*
              Le VRAI import, celui qui écrit en base — le même composant que dans
              « Personnes et inscriptions ». Il remplace la maquette qui se trouvait
              ici : elle lisait le fichier, affichait une prévisualisation et
              annonçait la création sans rien enregistrer. Un écran qui annonce un
              import réussi sans écrire est pire qu'une fonctionnalité absente.
            */}
            <div className="border-border border-t pt-6">
              <RealRosterImportPanel
                programId={data.program.id}
                cohorts={cohorts}
                existingEmails={data.people.map((p) => p.email)}
                onImported={() => void refetch()}
              />
            </div>
          </div>
        ) : (
          <EmptyState>Sélectionnez un programme pour créer une classe.</EmptyState>
        )}
      </PanelCard>

      {/* Suivi croisé : même table que dans « Pilotage de programme ». */}
      <LearnerTrackingSection data={data} />

      <CohortRosterSection data={data} section="export" />
    </div>
  );
}
