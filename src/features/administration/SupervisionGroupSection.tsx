/**
 * « Groupes d'encadrement : qui encadre qui » (ex-« Encadrement de la promotion »,
 * renommé le 18/09) — ÉCRITURE RÉELLE.
 *
 * GARDÉ DANS « GESTION DES STAGES », ET POURQUOI (Stef, 18/09 : « c'est la même
 * chose que l'Équipe d'encadrement ? »). Non : l'Équipe dit QUI encadre (le vivier,
 * la synchronisation, l'invitation) ; cette section dit QUI ENCADRE QUI — elle est
 * la seule à écrire les groupes (inscrits + terrain + encadrants) et à OUVRIR les
 * carnets de stage. La supprimer laisserait des encadrants sans étudiants et des
 * étudiants sans carnet. L'ancien titre prêtait à la confusion : il a changé.
 *
 * Générique par construction : la section travaille sur la cohorte
 * sélectionnée, quelle qu'elle soit, et sur n'importe quel programme. Rien
 * n'est propre à une promotion en particulier.
 *
 * Le modèle de la migration 20260831093000 : le RÔLE dit ce qu'un senior a le
 * droit de faire, le GROUPE dit sur quels étudiants. Un groupe appartient à une
 * cohorte ET à un terrain ; il porte plusieurs encadrants, et un encadrant peut
 * suivre plusieurs groupes.
 *
 * Deux contraintes qu'on ne contourne pas, et que l'écran DIT plutôt que de
 * laisser un bouton échouer :
 *
 * 1. `supervision_group_members` référence `enrollments`, pas `people` : une
 *    personne importée mais non inscrite ne peut pas entrer dans un groupe.
 * 2. `supervision_group_supervisors` référence `profiles` : un encadrant ajouté
 *    ici reste dans le sas tant qu'il ne s'est pas connecté. Il n'est donc pas
 *    cochable immédiatement — l'invitation est un geste à part.
 *
 * Et cocher quelqu'un ne lui DONNE aucun droit : le rôle se règle dans l'écran
 * des accès. La section signale l'écart au lieu de le masquer.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useDataAccess, useSession } from "@/application/session";
import { fullNameOfPendingPerson, type PendingPerson } from "@/domain/peopleStaging";
import type { StageLog } from "@/domain/stageLog";
import type {
  Cohort,
  Enrollment,
  EnrollmentId,
  Person,
  PersonId,
  Placement,
  PlacementId,
  ProgramId,
  RoleAssignment,
  SupervisionGroup,
} from "@/domain/types";

interface SupervisionGroupSectionProps {
  readonly programId: ProgramId;
  readonly cohorts: readonly Cohort[];
  readonly cohortId: string;
  readonly placements: readonly Placement[];
  readonly enrollments: readonly Enrollment[];
  readonly people: readonly Person[];
  readonly pendingPeople: readonly PendingPerson[];
  readonly roleAssignments: readonly RoleAssignment[];
  readonly groups: readonly SupervisionGroup[];
  /** Carnets déjà ouverts, pour savoir s'il en manque. */
  readonly stageLogs: readonly StageLog[];
  /** Rechargement du périmètre d'administration après écriture. */
  readonly onChanged: () => void;
}

/**
 * Un encadrant possible, vu par l'écran.
 *
 * La source de vérité est le SAS (`people`), pas `profiles` : lui seul porte
 * l'adresse électronique, et il contient la personne DÈS son ajout, avant
 * qu'elle se soit connectée. `profiles` ne sert qu'à savoir si la case est
 * cochable — et à ne perdre personne qui encadrerait déjà sans être passée par
 * le sas.
 */
interface SupervisorCandidate {
  readonly key: string;
  readonly fullName: string;
  readonly email: string | null;
  /** `null` tant que la personne ne s'est jamais connectée : case désactivée. */
  readonly profileId: string | null;
  readonly invited: boolean;
  /** Deviendra encadrante du terrain toute seule, à sa première connexion. */
  readonly autoEncadrant: boolean;
}

function buildCandidates(args: {
  readonly programId: ProgramId;
  /**
   * Le compte CONNECTÉ et son adresse.
   *
   * `profiles` n'a pas de colonne e-mail : l'adresse vit dans `auth.users`, que
   * le client ne peut lire que pour lui-même. Celle de l'utilisateur courant
   * est donc la seule récupérable sans fonction serveur — et c'est déjà celle
   * qu'on cherche le plus souvent, puisqu'on se coche soi-même en premier.
   */
  readonly selfId: string;
  readonly selfEmail: string;
  readonly people: readonly Person[];
  readonly pendingPeople: readonly PendingPerson[];
  readonly roleAssignments: readonly RoleAssignment[];
  readonly supervisorPersonIds: readonly string[];
}): readonly SupervisorCandidate[] {
  // Le vivier : les personnes du programme qui ne visent AUCUNE promotion.
  // Une personne rattachée à une promotion est un apprenant, pas un encadrant.
  const pool = args.pendingPeople.filter(
    (person) => person.intendedCohortId === undefined && person.status !== "cancelled",
  );

  const fromStaging: SupervisorCandidate[] = pool.map((person) => ({
    key: person.id,
    fullName: fullNameOfPendingPerson(person),
    email: person.loginEmail,
    profileId: person.activatedProfileId ?? null,
    invited: person.invitedAt !== undefined,
    autoEncadrant: person.intendedRole === "placement_supervisor",
  }));

  const known = new Set(fromStaging.map((c) => c.profileId).filter((id) => id !== null));

  /**
   * Les comptes qui EXERCENT déjà un rôle sur ce programme — administration,
   * enseignant, encadrant — sont cochables tels quels.
   *
   * Sans eux, la liste ne proposait que le sas, dont personne n'était encore
   * activé : toutes les cases étaient grisées et le groupe restait sans
   * encadrant. Un administrateur du programme peut déjà valider n'importe quel
   * carnet (`supervises_enrollment` passe par `can_administer_program`) : le
   * cacher de cette liste n'était pas une protection, seulement un angle mort.
   *
   * Les apprenants sont exclus : leur rôle est d'être encadrés.
   */
  const withRole = new Set(
    args.roleAssignments
      .filter(
        (assignment) =>
          assignment.role !== "learner" &&
          /*
           * NI LE RESPONSABLE DE TERRAIN. Il repond du terrain, il n encadre
           * pas les etudiants : le proposer a cocher ferait esperer une
           * validation de carnet que `stage_log_validations.validator_role`
           * refuse. Ajoute le 10/09 avec le role lui-meme.
           */
          assignment.role !== "placement_manager" &&
          (assignment.scope.kind === "platform" || assignment.scope.programId === args.programId),
      )
      .map((assignment) => assignment.personId as string),
  );

  const fromProfiles: SupervisorCandidate[] = args.people
    .filter(
      (person) =>
        !known.has(person.id) &&
        (withRole.has(person.id) || args.supervisorPersonIds.includes(person.id)),
    )
    .map((person) => ({
      key: person.id,
      fullName: person.fullName,
      email:
        person.id === args.selfId && args.selfEmail.length > 0
          ? args.selfEmail
          : emailFromStaging(person, args.pendingPeople),
      profileId: person.id,
      invited: true,
      autoEncadrant: false,
    }));

  return [...fromStaging, ...fromProfiles].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "fr"),
  );
}

/** `profiles` ne porte pas l'e-mail : il n'est connu que par le sas. */
function emailFromStaging(person: Person, pendingPeople: readonly PendingPerson[]): string | null {
  if (person.email.length > 0) return person.email;
  const staged = pendingPeople.find((p) => p.activatedProfileId === person.id);
  return staged?.loginEmail ?? null;
}

const EMPTY_SUPERVISOR = { firstName: "", lastName: "", loginEmail: "" };

export function SupervisionGroupSection({
  programId,
  cohorts,
  cohortId,
  placements,
  enrollments,
  people,
  pendingPeople,
  roleAssignments,
  groups,
  stageLogs,
  onChanged,
}: SupervisionGroupSectionProps) {
  const [placementId, setPlacementId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supervisorDraft, setSupervisorDraft] = useState<readonly string[] | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState<readonly string[] | null>(null);
  const [newSupervisor, setNewSupervisor] = useState(EMPTY_SUPERVISOR);
  const [added, setAdded] = useState<string | null>(null);
  const dataAccess = useDataAccess();
  const { person } = useSession();

  const cohort = cohorts.find((c) => c.id === cohortId);
  /*
   * PLUSIEURS GROUPES PAR PROMOTION (10/09). L'ecran n'en connaissait qu'un
   * seul -- `groups.find(...)` -- ce qui rendait impossible la seule chose que
   * Stef a decrite : deux moities qui alternent, l'une dans le service pendant
   * que l'autre travaille chez elle. La base, elle, l'autorisait depuis le
   * 31/08 : `unique (cohort_id, label)`, donc autant de groupes qu'on veut,
   * pourvu qu'ils portent des noms distincts.
   */
  const groupesDeLaPromo = groups.filter((g) => g.cohortId === cohortId);
  const group = groupesDeLaPromo.find((g) => g.id === groupId) ?? groupesDeLaPromo[0];
  const inscrits = enrollments.filter((e) => e.cohortId === cohortId);
  const targetPlacementId = placementId ?? placements[0]?.id ?? null;

  /** Encadrants cochés : le brouillon s'il existe, sinon l'état enregistré. */
  const checked = supervisorDraft ?? group?.supervisorPersonIds ?? [];

  const candidates = buildCandidates({
    programId,
    selfId: person.id,
    selfEmail: person.email,
    people,
    pendingPeople,
    roleAssignments,
    supervisorPersonIds: group?.supervisorPersonIds ?? [],
  });

  /**
   * Qui peut RÉELLEMENT valider un carnet — la question que l'avertissement
   * doit poser, et rien d'autre.
   *
   * Trois rôles y donnent droit, pas un seul : l'encadrant de stage,
   * l'enseignant, et l'administration du programme — `supervises_enrollment()`
   * est vraie pour `can_administer_program()` avant même de regarder les
   * groupes, et `stage_log_validations.validator_role` accepte les trois.
   * N'avertir que sur `placement_supervisor` accusait à tort un administrateur
   * qui, lui, n'aurait jamais été refusé.
   */
  const canValidateLogs = (personId: string) =>
    roleAssignments.some(
      (assignment) =>
        assignment.personId === personId &&
        (assignment.role === "placement_supervisor" ||
          assignment.role === "placement_manager" ||
          assignment.role === "teacher" ||
          assignment.role === "administrator") &&
        // La portée « plateforme » n'a pas de programme : elle vaut partout.
        (assignment.scope.kind === "platform" || assignment.scope.programId === programId),
    );

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const createGroup = () =>
    run(async () => {
      if (!cohort || !targetPlacementId) return;
      const premier = groupesDeLaPromo.length === 0;
      const created = await dataAccess.placements.createSupervisionGroup({
        cohortId: cohort.id,
        placementId: targetPlacementId as PlacementId,
        /*
         * `unique (cohort_id, label)` : un second groupe portant le nom de la
         * promotion serait refuse par la base. On suffixe donc a partir du
         * deuxieme, sans renommer le premier -- renommer casserait les reperes
         * de qui l'utilise deja.
         */
        label: premier
          ? cohort.label
          : `${cohort.label} — groupe ${String.fromCharCode(65 + groupesDeLaPromo.length)}`,
      });
      if (premier) {
        // Le premier groupe rassemble toute la promotion : c'est le cas
        // ordinaire, un seul geste pour l'utilisateur.
        await dataAccess.placements.setSupervisionGroupMembers(
          created.id,
          inscrits.map((e) => e.id as EnrollmentId),
        );
        // Le carnet existe DÈS maintenant, vide : un étudiant qui n'a rien
        // écrit doit rester visible pour son encadrant.
        await dataAccess.stageLogs.openStageLogsForGroup(created.id);
      }
      // UN GROUPE SUPPLEMENTAIRE NAIT VIDE, et c'est voulu : on le cree pour
      // separer la promotion, pas pour la dupliquer. Ses membres se cochent
      // ensuite, et le meme etudiant ne doit pas se retrouver dans les deux.
      setGroupId(created.id);
      setMemberDraft(null);
    }, "Constitution du groupe impossible.");

  const syncMembers = () =>
    run(async () => {
      if (!group) return;
      await dataAccess.placements.setSupervisionGroupMembers(
        group.id,
        inscrits.map((e) => e.id as EnrollmentId),
      );
      // Idempotent : ouvre le carnet des seuls nouveaux venus.
      await dataAccess.stageLogs.openStageLogsForGroup(group.id);
    }, "Mise à jour des membres impossible.");

  const saveSupervisors = () =>
    run(async () => {
      if (!group) return;
      await dataAccess.placements.setSupervisionGroupSupervisors(
        group.id,
        checked as readonly PersonId[],
      );
      setSupervisorDraft(null);
    }, "Enregistrement des encadrants impossible.");

  const addSupervisor = () =>
    run(async () => {
      const created = await dataAccess.peopleStaging.createPendingPerson({
        programId,
        firstName: newSupervisor.firstName.trim(),
        lastName: newSupervisor.lastName.trim(),
        loginEmail: newSupervisor.loginEmail.trim(),
        // Aucune promotion visée : un encadrant n'est pas un apprenant.
      });
      setNewSupervisor(EMPTY_SUPERVISOR);
      setAdded(fullNameOfPendingPerson(created));
    }, "Ajout de l'encadrant impossible.");

  const toggle = (personId: string) =>
    setSupervisorDraft(
      checked.includes(personId) ? checked.filter((id) => id !== personId) : [...checked, personId],
    );

  const missing = group
    ? inscrits.filter((e) => !group.memberEnrollmentIds.includes(e.id as EnrollmentId)).length
    : 0;

  /**
   * Carnets manquants — une action À PART ENTIÈRE, et non un effet de bord.
   *
   * L'ouverture était jusqu'ici accrochée à la constitution du groupe et à la
   * mise à jour des membres. Un groupe constitué AVANT que cette ouverture
   * existe, ou dont les membres n'ont jamais bougé depuis, restait donc sans
   * carnet : l'étudiant ouvrait « Mon carnet de stage » et n'y trouvait rien,
   * sans que rien ne l'explique côté administration. Le compte est désormais
   * affiché, et le bouton disponible tant qu'il manque un carnet.
   */
  const openedLogs = group
    ? stageLogs.filter(
        (log) =>
          log.placementId === group.placementId &&
          group.memberEnrollmentIds.includes(log.enrollmentId),
      ).length
    : 0;
  const missingLogs = group ? group.memberEnrollmentIds.length - openedLogs : 0;

  const openLogs = () =>
    run(async () => {
      if (!group) return;
      await dataAccess.stageLogs.openStageLogsForGroup(group.id);
    }, "Ouverture des carnets impossible.");

  /** Le nom porte par une inscription, pour cocher des personnes et non des identifiants. */
  const nomDeLInscription = (enrollmentId: string) => {
    const inscription = enrollments.find((e) => e.id === enrollmentId);
    return people.find((p) => p.id === inscription?.personId)?.fullName ?? "Apprenant sans profil";
  };

  const membresCoches = memberDraft ?? group?.memberEnrollmentIds ?? [];

  /** L'autre groupe de la promotion ou cet inscrit figure deja, s'il y en a un. */
  const autreGroupeDe = (enrollmentId: string) =>
    groupesDeLaPromo.find(
      (g) =>
        g.id !== group?.id && (g.memberEnrollmentIds as readonly string[]).includes(enrollmentId),
    );

  const basculerMembre = (enrollmentId: string) =>
    setMemberDraft(
      membresCoches.includes(enrollmentId)
        ? membresCoches.filter((id) => id !== enrollmentId)
        : [...membresCoches, enrollmentId],
    );

  const saveMembers = () =>
    run(async () => {
      if (!group) return;
      await dataAccess.placements.setSupervisionGroupMembers(
        group.id,
        membresCoches as readonly EnrollmentId[],
      );
      // Idempotent : ouvre le carnet des seuls nouveaux venus.
      await dataAccess.stageLogs.openStageLogsForGroup(group.id);
      setMemberDraft(null);
    }, "Enregistrement des membres impossible.");

  const newSupervisorReady =
    newSupervisor.firstName.trim().length > 0 &&
    newSupervisor.lastName.trim().length > 0 &&
    /.+@.+\..+/.test(newSupervisor.loginEmail.trim());

  return (
    <PanelCard
      collapsible
      title="Groupes d'encadrement : qui encadre qui"
      description="Rattache les inscrits de la promotion à un terrain et à leurs encadrants, et ouvre leurs carnets de stage. L'équipe elle-même (qui sont les encadrants, leur invitation) se gère dans l'onglet « Équipe d'encadrement »."
      action={group ? <Badge variant="secondary">{group.label}</Badge> : null}
    >
      {!cohort ? (
        <EmptyState>Sélectionnez une promotion.</EmptyState>
      ) : placements.length === 0 ? (
        <EmptyState>
          Aucun terrain de stage n'existe encore pour ce programme : créez-en un ci-dessus avant de
          constituer un groupe.
        </EmptyState>
      ) : inscrits.length === 0 && !group ? (
        <EmptyState>
          Aucun inscrit dans « {cohort.label} ». Un groupe d'encadrement se compose d'INSCRIPTIONS,
          pas de personnes importées : tant que les étudiants n'ont pas été invités puis activés, il
          n'y a personne à y mettre.
        </EmptyState>
      ) : !group ? (
        <div className="space-y-3">
          {placements.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="supervision-placement">Terrain de stage</Label>
              <Select
                value={targetPlacementId ?? ""}
                onValueChange={(next) => setPlacementId(next)}
              >
                <SelectTrigger id="supervision-placement" className="min-w-0">
                  <SelectValue placeholder="Choisir un terrain" />
                </SelectTrigger>
                <SelectContent>
                  {placements.map((placement) => (
                    <SelectItem key={placement.id} value={placement.id}>
                      {placement.name} — {placement.site}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Terrain : <strong>{placements[0]?.name}</strong> — {placements[0]?.site}
            </p>
          )}
          <Button onClick={createGroup} disabled={busy || !targetPlacementId}>
            {busy
              ? "Constitution…"
              : `Constituer le groupe d'encadrement (${inscrits.length} inscrit${inscrits.length > 1 ? "s" : ""})`}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/*
            LE CHOIX DU GROUPE, et la porte pour en ouvrir un second. Une
            promotion qui alterne par moities a DEUX groupes : celui qui est
            dans le service cette semaine, et celui qui travaille chez lui.
          */}
          <div className="flex flex-wrap items-end gap-3">
            {groupesDeLaPromo.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="supervision-groupe">Groupe</Label>
                <Select
                  value={group.id}
                  onValueChange={(next) => {
                    setGroupId(next);
                    setMemberDraft(null);
                    setSupervisorDraft(null);
                  }}
                >
                  <SelectTrigger id="supervision-groupe" className="min-w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groupesDeLaPromo.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label} — {g.memberEnrollmentIds.length} étudiant(s)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button variant="outline" onClick={createGroup} disabled={busy || !targetPlacementId}>
              {busy ? "Constitution…" : "Ajouter un groupe"}
            </Button>
            <p className="text-muted-foreground text-[12.5px]">
              Un groupe supplémentaire naît vide : cochez ensuite qui en fait partie.
            </p>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Terrain</dt>
              <dd>{placements.find((p) => p.id === group.placementId)?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Membres du groupe</dt>
              <dd>
                {group.memberEnrollmentIds.length} / {inscrits.length} inscrit(s)
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Encadrants</dt>
              <dd>{group.supervisorPersonIds.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Carnets ouverts</dt>
              <dd>
                {openedLogs} / {group.memberEnrollmentIds.length}
              </dd>
            </div>
          </dl>

          {missingLogs > 0 ? (
            <div className="space-y-2">
              <p className="text-sm">
                {missingLogs} membre(s) du groupe n'ont pas encore de carnet : ils ne verront rien
                dans « Mon carnet de stage », et vous ne les verrez pas dans les carnets à valider.
              </p>
              <Button variant="outline" onClick={openLogs} disabled={busy}>
                {busy ? "Ouverture…" : "Ouvrir les carnets manquants"}
              </Button>
            </div>
          ) : null}

          {/*
            « TOUT LE MONDE DANS LE GROUPE » N'A DE SENS QUE S'IL N'Y EN A QU'UN.
            Des qu'une promotion est coupee en deux, ce bouton y remettrait
            l'autre moitie : on le retire, et le choix se fait a la case.
          */}
          {missing > 0 && groupesDeLaPromo.length === 1 ? (
            <div className="space-y-2">
              <p className="text-sm">
                {missing} inscrit(s) de cette promotion ne sont pas encore dans le groupe.
              </p>
              <Button variant="outline" onClick={syncMembers} disabled={busy}>
                {busy ? "Mise à jour…" : "Mettre à jour les membres"}
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Qui fait partie de ce groupe</p>
            {inscrits.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun inscrit dans cette promotion.</p>
            ) : (
              <>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {inscrits.map((inscription) => {
                    const ailleurs = autreGroupeDe(inscription.id);
                    const coche = membresCoches.includes(inscription.id);
                    return (
                      <li key={inscription.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`membre-${inscription.id}`}
                          checked={coche}
                          onCheckedChange={() => basculerMembre(inscription.id)}
                        />
                        <label htmlFor={`membre-${inscription.id}`} className="text-sm">
                          <span className="block">{nomDeLInscription(inscription.id)}</span>
                          {ailleurs ? (
                            <span
                              className={
                                coche
                                  ? "text-destructive block text-[12px]"
                                  : "text-muted-foreground block text-[12px]"
                              }
                            >
                              {coche
                                ? `déjà dans « ${ailleurs.label} » — il serait dans les deux`
                                : `dans « ${ailleurs.label} »`}
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {memberDraft ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={saveMembers} disabled={busy}>
                      {busy ? "Enregistrement…" : "Enregistrer les membres"}
                    </Button>
                    <Button variant="ghost" onClick={() => setMemberDraft(null)} disabled={busy}>
                      Annuler
                    </Button>
                    <span className="text-muted-foreground text-[12.5px]">
                      {membresCoches.length} coché(s) — les carnets manquants s'ouvriront.
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Qui encadre ce groupe</Label>
            {candidates.length === 0 ? (
              <EmptyState>
                Personne dans ce programme pour l'instant. Ajoutez un encadrant ci-dessous.
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {candidates.map((candidate) => {
                  const isChecked =
                    candidate.profileId !== null && checked.includes(candidate.profileId);
                  const inputId = `supervisor-${candidate.key}`;
                  return (
                    <li key={candidate.key} className="flex items-start gap-2">
                      <Checkbox
                        id={inputId}
                        className="mt-1"
                        checked={isChecked}
                        disabled={candidate.profileId === null}
                        onCheckedChange={() =>
                          candidate.profileId !== null && toggle(candidate.profileId)
                        }
                      />
                      <Label htmlFor={inputId} className="min-w-0 flex-1 font-normal">
                        <span className="block">{candidate.fullName}</span>
                        <span className="text-muted-foreground block text-xs break-all">
                          {candidate.email ?? "adresse inconnue"}
                        </span>
                        {candidate.profileId === null ? (
                          <span className="text-muted-foreground block text-xs">
                            {candidate.invited
                              ? "Invitée, en attente de première connexion"
                              : "Jamais invitée"}
                            — ne peut pas encore encadrer : c'est la connexion qui crée le compte.
                            {/*
                              RIEN A COCHER POUR ELLE, MEME PLUS TARD. Depuis la
                              migration 20260910200000, une personne rapportee par
                              la source d equipe rejoint TOUS les groupes du
                              terrain a l activation de son compte. Laisser croire
                              qu il faudra revenir la cocher ferait attendre un
                              geste qui n existe pas.
                            */}
                            {candidate.autoEncadrant
                              ? " Elle rejoindra ensuite tous les groupes de ce terrain d'elle-même : il reste seulement à l'inviter."
                              : ""}
                          </span>
                        ) : isChecked && !canValidateLogs(candidate.profileId) ? (
                          <span className="text-destructive block text-xs">
                            Aucun rôle permettant de valider un carnet sur ce programme (encadrant
                            de stage, enseignant ou administration) : à accorder dans l'écran des
                            accès, sinon la validation lui sera refusée.
                          </span>
                        ) : null}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button onClick={saveSupervisors} disabled={busy || supervisorDraft === null}>
              {busy ? "Enregistrement…" : "Enregistrer les encadrants"}
            </Button>
          </div>

          <div className="border-border space-y-3 border-t pt-4">
            <div>
              <Label>Ajouter un encadrant</Label>
              <p className="text-muted-foreground text-sm">
                La personne rejoint la liste du programme. Elle ne devient cochable qu'après avoir
                été invitée et s'être connectée une première fois — c'est sa connexion qui crée son
                compte.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-supervisor-first">Prénom</Label>
                <Input
                  id="new-supervisor-first"
                  value={newSupervisor.firstName}
                  onChange={(e) =>
                    setNewSupervisor((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-supervisor-last">Nom</Label>
                <Input
                  id="new-supervisor-last"
                  value={newSupervisor.lastName}
                  onChange={(e) =>
                    setNewSupervisor((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-supervisor-email">Adresse électronique</Label>
                <Input
                  id="new-supervisor-email"
                  type="email"
                  value={newSupervisor.loginEmail}
                  onChange={(e) =>
                    setNewSupervisor((prev) => ({ ...prev, loginEmail: e.target.value }))
                  }
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={addSupervisor}
              disabled={busy || !newSupervisorReady}
            >
              {busy ? "Ajout…" : "Ajouter cet encadrant"}
            </Button>
            {added ? (
              <p className="text-sm">
                {added} apparaît maintenant dans la liste ci-dessus. Aucun courriel n'a été envoyé :
                l'invitation se déclenche depuis l'écran des personnes, et c'est la première
                connexion qui rendra la case cochable.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
    </PanelCard>
  );
}
