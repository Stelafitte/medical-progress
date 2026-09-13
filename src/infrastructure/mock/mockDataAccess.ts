/**
 * Implémentation mock des repositories : purement en mémoire, sans persistance.
 * Remplaçable par une implémentation base de données sans toucher à l'UI.
 */
import type { DataAccess } from "@/application/ports/repositories";
import {
  normalizeLoginEmail,
  statusAfterRestore,
  type PendingPerson,
} from "@/domain/peopleStaging";
import type {
  Cohort,
  LearningResource,
  Outcome,
  OutcomeTheme,
  Placement,
  PlacementId,
  Program,
  RoleAssignment,
  SupervisionGroup,
  SupervisionGroupId,
} from "@/domain/types";
import { scopeFromGrantFields } from "@/domain/accessGrant";
import type { AssessmentModality } from "@/domain/assessmentModality";
import {
  defaultProgramAiSettings,
  type AiFallbackPolicy,
  type ProgramAiSettings,
} from "@/domain/programAi";
import type { ProgramId } from "@/domain/types";
import type { MilestoneShift, PlanMilestoneId } from "@/domain/acquisitionPlan";
import type { EnrollmentId } from "@/domain/types";
import type { EcosExternalRun, EcosGridItem } from "@/domain/ecos";
import { modalityFixturesFor } from "./assessmentModalityFixtures";
import * as fx from "./fixtures";
import * as pfx from "./professionalFixtures";
import * as slfx from "./stageLogFixtures";
import * as stfx from "./statisticsFixtures";
import { toLearnerNarratedDeck } from "@/domain/mediaLibrary";
import { toLearnerAiResource } from "@/domain/contentAi";
import * as mfx from "./mediaFixtures";
import * as cafx from "./contentAiFixtures";
import * as aicfx from "./aiCreditsFixtures";
import * as efx from "./ecosFixtures";
import * as dpc from "./dpcFixtures";
import * as hvg from "./dpcHvgFixtures";

const clone = <T>(value: T): T => value;
const ok = <T>(value: T): Promise<T> => Promise.resolve(clone(value));

/**
 * Les jalons deplaces en maquette, le temps de la session, par inscription.
 * Vide au demarrage : la demonstration ne part pas sur un plan deja reamenage.
 */
const decalagesDeDemo = new Map<EnrollmentId, Map<PlanMilestoneId, MilestoneShift>>();

/**
 * Reglages IA de la maquette. UN OBJET MUTABLE, volontairement : la maquette
 * doit se comporter comme la base sur le seul point qui compte pour l'ecran —
 * ce qu'on enregistre, on le relit. Un mock en lecture seule ferait croire a un
 * bouton « Enregistrer » sans effet, et personne ne saurait si le defaut vient
 * de l'ecran ou du depot.
 *
 * Aucun fournisseur : la maquette n'a pas de cle, donc `enabled` y reste
 * refusable comme en base.
 */
const mockProgramAiSettings = new Map<ProgramId, ProgramAiSettings>();

/**
 * Terrains et groupes d'encadrement CRÉÉS PENDANT LA SESSION mock. En mémoire,
 * comme tout le reste de ce fichier : rien n'est persisté, l'état disparaît au
 * rechargement. Le backend Supabase, lui, écrit vraiment.
 */
const createdPlacements: Placement[] = [];
const createdGroups: SupervisionGroup[] = [];

/**
 * Recopie une personne du sas SANS certaines de ses clés optionnelles.
 *
 * `exactOptionalPropertyTypes` distingue « absente » de « valant undefined » :
 * poser `{ ...person, cancelledAt: undefined }` ne compile pas, et laisser la
 * clé ferait survivre une date d'annulation à la restauration.
 */
function omitPendingPersonKeys(
  person: PendingPerson,
  keys: readonly (keyof PendingPerson)[],
): PendingPerson {
  const copy: Record<string, unknown> = { ...person };
  for (const key of keys) delete copy[key];
  return copy as unknown as PendingPerson;
}

export const mockDataAccess: DataAccess = {
  isMock: true,
  /**
   * `cohorts` est mutable ici : `createCohort` doit pouvoir ajouter une
   * classe et la voir immédiatement dans `listCohorts`, même pattern que
   * `peopleStaging`/`administration` ci-dessous.
   */
  programs: (() => {
    let cohorts: Cohort[] = [...fx.cohorts];
    let counter = 0;
    const designDrafts = new Map<string, Record<string, unknown>>();
    const planShifts = new Map<string, boolean>();
    /*
     * LES DEUX REGLAGES EN MEMOIRE S'APPLIQUENT A LA LECTURE, EN UN SEUL
     * ENDROIT. Sans cela l'interrupteur du plan repondrait « enregistre » et
     * la relecture rendrait la valeur d'origine : l'ecran apprenant, qui lit
     * `getProgram`, ne verrait jamais le changement.
     */
    const relu = (programme: Program): Program => {
      const draft = designDrafts.get(programme.id);
      const shifts = planShifts.get(programme.id);
      const avecDraft = draft ? { ...programme, designDraft: draft } : programme;
      return shifts === undefined
        ? avecDraft
        : { ...avecDraft, config: { ...avecDraft.config, learnerPlanShiftsEnabled: shifts } };
    };
    return {
      listPrograms: () => ok(fx.programs.map(relu)),
      getProgram: (id) => {
        const found = fx.programs.find((p) => p.id === id);
        return ok(found ? relu(found) : undefined);
      },
      saveProgramDesignDraft: (programId, draft) => {
        if (draft) designDrafts.set(programId, draft);
        else designDrafts.delete(programId);
        return ok(undefined);
      },
      /*
       * LE REGLAGE VIT EN MEMOIRE, LE TEMPS DE LA SESSION. La demonstration
       * doit pouvoir montrer l'interrupteur et l'effet qu'il produit cote
       * apprenant ; elle n'a pas de base pour s'en souvenir.
       */
      setLearnerPlanShifts: (programId, enabled) => {
        const programme = fx.programs.find((p) => p.id === programId);
        if (!programme) return Promise.reject(new Error("Programme introuvable."));
        planShifts.set(programId, enabled);
        return ok(relu(programme));
      },
      // Aucun appel IA réel en mock : pas d'infrastructure serveur ici.
      analyzeObjectivesForReferential: () =>
        ok({ knowledgeItems: [], assessmentModalities: [], truncated: false }),
      listCurriculumVersions: (programId) =>
        ok(fx.curriculumVersions.filter((c) => c.programId === programId)),
      listCohorts: (programId, options) => {
        const scoped = programId ? cohorts.filter((c) => c.programId === programId) : cohorts;
        return ok(options?.includeArchived ? scoped : scoped.filter((c) => !c.archivedAt));
      },
      getCohort: (id) => ok(cohorts.find((c) => c.id === id)),
      createCohort: (input) => {
        counter += 1;
        const created: Cohort = {
          id: `mock-cohort-${counter}` as Cohort["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          curriculumVersionId: input.curriculumVersionId,
          label: input.label,
          academicYear: input.academicYear,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          learnerCount: 0,
          status: "draft",
          archivedAt: null,
        };
        cohorts = [...cohorts, created];
        return ok(created);
      },
      /*
       * Le sceau exige la base : il compte les jalons et les acquis rattachés,
       * que la maquette n'a pas. Un sceau de démonstration certifierait du vide.
       */
      openCohort: () =>
        Promise.reject(new Error("Ouvrir une promotion exige une connexion à la base.")),
      revertCohortToDraft: () =>
        Promise.reject(new Error("Ouvrir une promotion exige une connexion à la base.")),
      updateCohort: (input) => {
        const existing = cohorts.find((c) => c.id === input.cohortId);
        if (!existing) return ok(undefined as never);
        const updated: Cohort = {
          ...existing,
          label: input.label,
          academicYear: input.academicYear,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
        };
        cohorts = cohorts.map((c) => (c.id === updated.id ? updated : c));
        return ok(updated);
      },
      setCohortArchived: (cohortId, archived) => {
        const existing = cohorts.find((c) => c.id === cohortId);
        if (!existing) return ok(undefined as never);
        const updated: Cohort = {
          ...existing,
          archivedAt: archived ? new Date().toISOString() : null,
        };
        cohorts = cohorts.map((c) => (c.id === updated.id ? updated : c));
        return ok(updated);
      },
    };
  })(),
  people: {
    updateOwnProfile: (input) => ok({ ...fx.people[0]!, fullName: input.fullName }),
    getPerson: (id) => ok(fx.people.find((p) => p.id === id)),
    listEnrollments: (personId) => ok(fx.enrollments.filter((e) => e.personId === personId)),
    listRoleAssignments: (personId) =>
      ok(fx.roleAssignments.filter((r) => r.personId === personId)),
  },
  /**
   * Sas de pré-inscription (D94) : non consommé par la maquette locale
   * (PeopleEnrollmentsView utilise directoryStore en mode simulé), mais
   * doit rester fonctionnel pour satisfaire l'interface DataAccess et pour
   * d'éventuels tests. Purement en mémoire, réinitialisé au rechargement.
   */
  peopleStaging: (() => {
    let pending: PendingPerson[] = [];
    let counter = 0;
    return {
      listPendingPeople: (programId) => ok(pending.filter((p) => p.programId === programId)),
      createPendingPerson: (input) => {
        counter += 1;
        const now = new Date().toISOString();
        const created: PendingPerson = {
          id: `mock-pending-${counter}`,
          programId: input.programId,
          firstName: input.firstName,
          lastName: input.lastName,
          loginEmail: input.loginEmail.trim().toLowerCase(),
          origin: "individual",
          status: "pending",
          createdAt: now,
          updatedAt: now,
          ...(input.institutionalId ? { institutionalId: input.institutionalId } : {}),
          ...(input.intendedCohortId ? { intendedCohortId: input.intendedCohortId } : {}),
        };
        pending = [...pending, created];
        return ok(created);
      },
      sendInvitations: (personIds) => {
        const now = new Date().toISOString();
        pending = pending.map((p) =>
          personIds.includes(p.id) ? { ...p, status: "invited", invitedAt: now } : p,
        );
        return ok(personIds.map((personId) => ({ personId, ok: true })));
      },
      updatePendingPerson: (input) => {
        const found = pending.find((p) => p.id === input.personId);
        if (!found) return Promise.reject(new Error("Personne introuvable."));
        /*
         * Les deux champs effaçables se traitent AVANT le reste : les répandre
         * avec les autres les rendrait indistinguables d'un « ne pas toucher »,
         * et vider une promotion deviendrait impossible.
         */
        const base = omitPendingPersonKeys(found, ["institutionalId", "intendedCohortId"]);
        const institutionalId =
          input.clearInstitutionalId === true
            ? undefined
            : (input.institutionalId?.trim() ?? found.institutionalId);
        const intendedCohortId =
          input.clearIntendedCohortId === true
            ? undefined
            : (input.intendedCohortId ?? found.intendedCohortId);
        const revised: PendingPerson = {
          ...base,
          ...(input.firstName === undefined ? {} : { firstName: input.firstName.trim() }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName.trim() }),
          ...(input.loginEmail === undefined
            ? {}
            : { loginEmail: normalizeLoginEmail(input.loginEmail) }),
          ...(institutionalId === undefined ? {} : { institutionalId }),
          ...(intendedCohortId === undefined ? {} : { intendedCohortId }),
          updatedAt: new Date().toISOString(),
        };
        pending = pending.map((p) => (p.id === input.personId ? revised : p));
        return ok(revised);
      },
      setPendingPersonCancelled: (personId, cancelled) => {
        const found = pending.find((p) => p.id === personId);
        if (!found) return Promise.reject(new Error("Personne introuvable."));
        const next: PendingPerson = cancelled
          ? { ...found, status: "cancelled", cancelledAt: new Date().toISOString() }
          : { ...omitPendingPersonKeys(found, ["cancelledAt"]), status: statusAfterRestore(found) };
        pending = pending.map((p) => (p.id === personId ? next : p));
        return ok(next);
      },
    };
  })(),
  /**
   * `outcomes` est mutable ici : `createOutcome` doit pouvoir ajouter une
   * compétence ou une connaissance et la voir immédiatement dans
   * `listOutcomes`, même pattern que `programs`/`assessments` ci-dessus.
   */
  outcomes: (() => {
    let outcomes: Outcome[] = [...fx.outcomes];
    let themes: OutcomeTheme[] = [];
    let counter = 0;
    let themeCounter = 0;
    return {
      listOutcomes: (programId) => ok(outcomes.filter((o) => o.programId === programId)),
      listOutcomeRelations: (programId) => {
        const ids = new Set(outcomes.filter((o) => o.programId === programId).map((o) => o.id));
        return ok(
          fx.outcomeRelations.filter((r) => ids.has(r.fromOutcomeId) && ids.has(r.toOutcomeId)),
        );
      },
      createOutcome: (input) => {
        counter += 1;
        const created: Outcome = {
          id: `mock-outcome-${counter}` as Outcome["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          curriculumVersionId: input.curriculumVersionId,
          code: input.code,
          label: input.label,
          description: input.description,
          nature: input.nature,
          domain: input.domain,
          targetMastery: input.targetMastery,
          retainedAt: new Date().toISOString(),
          ...(input.knowledgeRank ? { knowledgeRank: input.knowledgeRank } : {}),
        };
        outcomes = [...outcomes, created];
        return ok(created);
      },
      updateOutcome: (input) => {
        const existing = outcomes.find((o) => o.id === input.outcomeId);
        if (!existing) return ok(undefined as never);
        const updated: Outcome = {
          ...existing,
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.targetMastery !== undefined ? { targetMastery: input.targetMastery } : {}),
          ...(input.knowledgeRank !== undefined ? { knowledgeRank: input.knowledgeRank } : {}),
        };
        outcomes = outcomes.map((o) => (o.id === updated.id ? updated : o));
        return ok(updated);
      },
      listTakenOutcomeCodes: (programId) =>
        ok(outcomes.filter((o) => o.programId === programId).map((o) => o.code)),
      archiveOutcome: (outcomeId) => {
        outcomes = outcomes.filter((o) => o.id !== outcomeId);
        return ok(undefined);
      },
      setOutcomesRetained: (outcomeIds, retained) => {
        const targets = new Set<string>(outcomeIds);
        outcomes = outcomes.map((o) =>
          targets.has(o.id) ? { ...o, retainedAt: retained ? new Date().toISOString() : null } : o,
        );
        return ok(undefined);
      },
      listOutcomeThemes: (programId) =>
        ok(themes.filter((t) => t.programId === programId).sort((a, b) => a.position - b.position)),
      createOutcomeTheme: (input) => {
        themeCounter += 1;
        const created: OutcomeTheme = {
          id: `mock-theme-${themeCounter}` as OutcomeTheme["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          label: input.label,
          description: input.description ?? "",
          position: input.position ?? themeCounter,
        };
        themes = [...themes, created];
        return ok(created);
      },
      setOutcomesTheme: (outcomeIds, themeId) => {
        const order = new Map(outcomeIds.map((id, index) => [id as string, index + 1]));
        outcomes = outcomes.map((o) => {
          const position = order.get(o.id);
          if (position === undefined) return o;
          // `exactOptionalPropertyTypes` interdit `themeId: undefined` : pour
          // retirer un acquis de son thème, on enlève la clé.
          const { themeId: _previous, ...rest } = o;
          return themeId ? { ...rest, themeId, position } : { ...rest, position };
        });
        return ok(undefined);
      },
    };
  })(),
  evidence: {
    listEvidenceForEnrollment: (enrollmentId) =>
      ok(fx.evidence.filter((e) => e.enrollmentId === enrollmentId)),
  },
  placements: {
    listPlacements: (programId) =>
      ok([
        ...fx.placements.filter((p) => p.programId === programId),
        ...createdPlacements.filter((p) => p.programId === programId),
      ]),
    createPlacement: (input) => {
      const created: Placement = {
        id: `plc-mock-${createdPlacements.length + 1}` as PlacementId,
        createdAt: new Date().toISOString(),
        provenance: { sourceSystem: "native" },
        programId: input.programId,
        name: input.name,
        site: input.site,
        department: input.department,
        capacity: input.capacity,
      };
      createdPlacements.push(created);
      return ok(created);
    },
    listSupervisionGroups: (programId) =>
      ok(createdGroups.filter((g) => g.programId === programId)),
    /* Le calendrier des semaines n'existe qu'en base : en session simulee il
       est vide, et le calendrier de presence retombe sur son repli documente. */
    listSupervisionGroupWeeks: () => ok([]),
    joinSupervisionGroup: () => ok(undefined),
    setSupervisionGroupWeek: () => ok(undefined),
    generateSupervisionGroupWeeks: () => ok(0),
    createSupervisionGroup: (input) => {
      const placement = [...fx.placements, ...createdPlacements].find(
        (p) => p.id === input.placementId,
      );
      const created: SupervisionGroup = {
        id: `grp-mock-${createdGroups.length + 1}` as SupervisionGroupId,
        createdAt: new Date().toISOString(),
        provenance: { sourceSystem: "native" },
        programId: placement?.programId ?? ("program-unknown" as ProgramId),
        cohortId: input.cohortId,
        placementId: input.placementId,
        label: input.label,
        memberEnrollmentIds: [],
        supervisorPersonIds: [],
      };
      createdGroups.push(created);
      return ok(created);
    },
    setSupervisionGroupMembers: (groupId, enrollmentIds) => {
      const index = createdGroups.findIndex((g) => g.id === groupId);
      const group = createdGroups[index];
      if (group) {
        createdGroups[index] = { ...group, memberEnrollmentIds: [...enrollmentIds] };
      }
      return ok(undefined);
    },
    setSupervisionGroupSupervisors: (groupId, personIds) => {
      const index = createdGroups.findIndex((g) => g.id === groupId);
      const group = createdGroups[index];
      if (group) {
        createdGroups[index] = { ...group, supervisorPersonIds: [...personIds] };
      }
      return ok(undefined);
    },
    listAssignmentsForEnrollment: (enrollmentId) =>
      ok(fx.placementAssignments.filter((a) => a.enrollmentId === enrollmentId)),
    listAssignmentsForProgram: (programId) => {
      const placementIds = new Set(
        fx.placements.filter((p) => p.programId === programId).map((p) => p.id),
      );
      return ok(fx.placementAssignments.filter((a) => placementIds.has(a.placementId)));
    },
    listAssignmentsForSupervisor: (supervisorPersonId, programId) => {
      const placementIds = new Set(
        fx.placements.filter((p) => p.programId === programId).map((p) => p.id),
      );
      return ok(
        fx.placementAssignments.filter(
          (a) => a.supervisorPersonId === supervisorPersonId && placementIds.has(a.placementId),
        ),
      );
    },
  },
  supervision: {
    listAlerts: (programId) => ok(pfx.supervisionAlerts.filter((a) => a.programId === programId)),
    listCaseDiscussions: (programId) =>
      ok(pfx.caseDiscussions.filter((c) => c.programId === programId)),
    listCompetenceConfirmations: (programId) =>
      ok(pfx.competenceConfirmations.filter((c) => c.programId === programId)),
    listPlacementReports: (programId) =>
      ok(pfx.placementReports.filter((r) => r.programId === programId)),
    listMessages: (programId) =>
      ok(pfx.professionalMessages.filter((m) => m.programId === programId)),
    listEnrollmentsByIds: (ids) => ok(fx.enrollments.filter((e) => ids.includes(e.id))),
    listPeopleByIds: (ids) => ok(fx.people.filter((p) => ids.includes(p.id))),
  },
  /**
   * `roleAssignments` est mutable ici : `grantRoleAssignment` doit pouvoir
   * ajouter un droit et le voir immédiatement dans `listAllRoleAssignments`,
   * même pattern que `peopleStaging` ci-dessus.
   */
  administration: (() => {
    let roleAssignments: RoleAssignment[] = [...fx.roleAssignments];
    return {
      listDocuments: (programId) => ok(pfx.adminDocuments.filter((d) => d.programId === programId)),
      listCertificates: (programId) =>
        ok(pfx.completionCertificates.filter((c) => c.programId === programId)),
      listTasks: (programId) => ok(pfx.adminTasks.filter((t) => t.programId === programId)),
      listMessageTemplates: () => ok(pfx.messageTemplates),
      listSendHistory: (programId) => ok(pfx.sendHistory.filter((s) => s.programId === programId)),
      listPeople: () => ok(fx.people),
      listAllRoleAssignments: () => ok(roleAssignments),
      listAllEnrollments: (programId) =>
        ok(fx.enrollments.filter((e) => e.programId === programId)),
      listPlatformSupervision: () => ok(pfx.platformSupervision),
      grantRoleAssignment: (input) => {
        const created: RoleAssignment = {
          personId: input.personId,
          role: input.role,
          scope: scopeFromGrantFields(input.scopeKind, input.scopeId, input.programId),
          grantedAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
        };
        roleAssignments = [...roleAssignments, created];
        return ok(created);
      },
    };
  })(),
  /**
   * Référentiel des modalités d'évaluation : seedé avec les fixtures
   * déterministes du programme dès la première lecture, puis mutable, même
   * pattern que `peopleStaging`/`administration` ci-dessus. Les sessions par
   * cohorte restent hors périmètre (voir `assessmentModalityFixtures`).
   */
  assessments: (() => {
    let modalities: AssessmentModality[] = [];
    const seededPrograms = new Set<ProgramId>();
    let counter = 0;

    function ensureSeeded(programId: ProgramId): void {
      if (seededPrograms.has(programId)) return;
      seededPrograms.add(programId);
      modalities = [...modalities, ...modalityFixturesFor(programId)];
    }

    return {
      listAssessmentModalities: (programId) => {
        ensureSeeded(programId);
        return ok(modalities.filter((m) => m.programId === programId));
      },
      createAssessmentModality: (input) => {
        ensureSeeded(input.programId);
        counter += 1;
        const now = new Date().toISOString();
        const notes = input.notes.trim();
        const created: AssessmentModality = {
          id: `mock-modality-${counter}`,
          programId: input.programId,
          name: input.name.trim(),
          createdAt: now,
          updatedAt: now,
          mode: input.mode,
          subtype: input.subtype,
          usage: input.usage,
          ...(notes.length > 0 ? { notes } : {}),
        };
        modalities = [...modalities, created];
        return ok(created);
      },
      archiveAssessmentModality: (assessmentModalityId) => {
        modalities = modalities.filter((m) => m.id !== assessmentModalityId);
        return ok(undefined);
      },
    };
  })(),
  /**
   * `resources` est mutable ici : `createResource` (et le reste du flux de
   * création réelle — upload, enregistrement d'asset, publication d'un
   * diaporama sonorisé) doit se refléter immédiatement dans `listResources`,
   * même pattern que `outcomes`/`peopleStaging` ci-dessus. Aucun octet n'est
   * réellement transmis en mode mock : `uploadResourceFile` est un no-op.
   */
  resources: (() => {
    let resources: LearningResource[] = [...fx.learningResources];
    let texts: {
      resourceId: string;
      sourcePath: string;
      segmentIndex: number;
      content: string;
    }[] = [];
    let counter = 0;
    return {
      listResources: (programId) => ok(resources.filter((r) => r.programId === programId)),
      /*
       * Aucun seau derriere le mock : rendre une fausse URL ferait afficher un
       * lecteur qui ne lit rien. `null` fait dire a l'ecran ce qui est vrai —
       * le fichier n'est pas atteignable ici.
       */
      signResourceMediaUrl: () => ok(null),
      storeResourceText: (resourceId, sourcePath, segments) => {
        // Remplacement, comme le RPC réel : un réimport ne doit pas empiler
        // les segments d'une version précédente.
        texts = texts.filter((t) => !(t.resourceId === resourceId && t.sourcePath === sourcePath));
        const kept = segments.filter((segment) => segment.trim().length > 0);
        texts = [
          ...texts,
          ...kept.map((content, index) => ({
            resourceId,
            sourcePath,
            segmentIndex: index + 1,
            content,
          })),
        ];
        return ok(kept.length);
      },
      /*
       * LE TEXTE 2026 N'A PAS DE FIXTURE, ET C'EST VOLONTAIRE. `course_sections`
       * porte le livre de l'editeur ; en inventer un extrait pour la maquette
       * ferait lire a un testeur du faux cours de cardiologie, indiscernable du
       * vrai. Zero section est d'ailleurs une reponse VALIDE cote ecran (quatre
       * supports du programme n'ont pas de chapitre) : le mock rend donc le meme
       * vide que la base rendrait, ce qui est la reponse honnete.
       */
      readChapterSections: () => ok([]),
      readOutcomeSections: () => ok({ origin: undefined, sections: [] }),
      listResourceTexts: (resourceId) =>
        ok(
          texts
            .filter((t) => t.resourceId === resourceId)
            .slice()
            .sort((a, b) =>
              a.sourcePath === b.sourcePath
                ? a.segmentIndex - b.segmentIndex
                : a.sourcePath.localeCompare(b.sourcePath),
            )
            .map((t) => ({
              sourcePath: t.sourcePath,
              segmentIndex: t.segmentIndex,
              content: t.content,
            })),
        ),
      searchResourceTexts: (programId, query, limit) => {
        // Recherche naïve : la maquette ne reproduit ni la racinisation ni la
        // désaccentuation du serveur, elle sert à faire tourner l'écran.
        const needle = query.trim().toLowerCase();
        const byId = new Map(resources.map((r) => [r.id as string, r]));
        return ok(
          texts
            .filter((t) => byId.get(t.resourceId)?.programId === programId)
            .filter((t) => needle.length > 0 && t.content.toLowerCase().includes(needle))
            .slice(0, limit ?? 10)
            .map((t) => ({
              resourceId: t.resourceId as LearningResource["id"],
              resourceTitle: byId.get(t.resourceId)?.title ?? "",
              sourcePath: t.sourcePath,
              segmentIndex: t.segmentIndex,
              content: t.content,
              rank: 1,
            })),
        );
      },
      createResource: (input) => {
        counter += 1;
        const created: LearningResource = {
          id: `mock-resource-${counter}` as LearningResource["id"],
          createdAt: new Date().toISOString(),
          provenance: { sourceSystem: "native" },
          programId: input.programId,
          title: input.title,
          format: input.format,
          outcomeIds: input.outcomeIds,
          estimatedMinutes: 0,
        };
        resources = [...resources, created];
        return ok(created);
      },
      linkResourceOutcomes: (resourceId, outcomeIds) => {
        const existing = resources.find((r) => r.id === resourceId);
        if (!existing) return ok(0);
        const deja = new Set(existing.outcomeIds);
        const nouveaux = outcomeIds.filter((id) => !deja.has(id));
        const updated: LearningResource = {
          ...existing,
          outcomeIds: [...existing.outcomeIds, ...nouveaux],
        };
        resources = resources.map((r) => (r.id === updated.id ? updated : r));
        return ok(nouveaux.length);
      },
      requestUploadUrl: (input) => {
        counter += 1;
        return ok({
          bucket: input.bucket,
          objectPath: `mock/${input.programId}/${counter}-${input.fileName}`,
          signedUrl: `mock://upload/${counter}`,
          token: `mock-token-${counter}`,
        });
      },
      uploadResourceFile: () => ok(undefined),
      registerAsset: (input) => {
        counter += 1;
        return ok({
          id: `mock-asset-${counter}`,
          resourceId: input.resourceId,
          kind: input.kind,
          bucketName: input.bucketName,
          objectPath: input.objectPath,
        });
      },
      publishNarratedDeck: (input) => {
        counter += 1;
        return ok({
          id: `mock-deck-${counter}`,
          resourceId: input.resourceId,
          version: 1,
          status: "published",
        });
      },
      /** Aucun diaporama reellement stocke dans la maquette. */
      getNarratedDeckPlayback: () => ok(undefined),
      /** Aucune transcription hors ligne : la maquette annonce simplement qu'il n'y a rien a faire. */
      transcribeNextSlide: () => ok({ slideIndex: null, characters: 0, remaining: 0, done: true }),
    };
  })(),
  media: {
    listMedia: (programId) => ok(mfx.mediaResources.filter((m) => m.programId === programId)),
    getMedia: (id) => ok(mfx.mediaResources.find((m) => m.id === id)),
    listLearnerNarratedDecks: (programId) =>
      ok(
        mfx.mediaResources
          .filter((m) => m.programId === programId)
          .map((m) => toLearnerNarratedDeck(m))
          .filter((d): d is NonNullable<typeof d> => d !== undefined),
      ),
  },
  programAi: {
    getSettings: (programId) =>
      ok(mockProgramAiSettings.get(programId) ?? defaultProgramAiSettings(programId)),
    saveSettings: (input: {
      programId: ProgramId;
      enabled: boolean;
      monthlyCreditCap: number;
      fallbackPolicy: AiFallbackPolicy;
    }) => {
      const precedent =
        mockProgramAiSettings.get(input.programId) ?? defaultProgramAiSettings(input.programId);
      const enregistre: ProgramAiSettings = {
        ...precedent,
        enabled: input.enabled,
        monthlyCreditCap: input.monthlyCreditCap,
        fallbackPolicy: input.fallbackPolicy,
      };
      mockProgramAiSettings.set(input.programId, enregistre);
      return ok(enregistre);
    },
    getUsageThisMonth: () =>
      ok({ creditsTotal: 0, messagesTotal: 0, learnersActive: 0, learnersAtCap: 0 }),
  },
  aiCredits: {
    listEntries: (programId) => ok(aicfx.aiCreditEntries.filter((e) => e.programId === programId)),
    getBudget: (programId) => ok(aicfx.aiCreditBudgets.find((b) => b.programId === programId)),
  },
  contentAi: {
    listProfiles: (programId) =>
      ok(cafx.allContentAiProfiles.filter((p) => p.programId === programId)),
    getProfile: (mediaId) => ok(cafx.allContentAiProfiles.find((p) => p.mediaId === mediaId)),
    getPolicy: (programId) => ok(cafx.programAiPolicies.find((p) => p.programId === programId)),
    listLearnerAiResources: (programId) => {
      const policy = cafx.programAiPolicies.find((p) => p.programId === programId);
      if (!policy) return ok([]);
      return ok(
        mfx.mediaResources
          .filter((m) => m.programId === programId)
          .map((m) =>
            toLearnerAiResource(
              m,
              cafx.allContentAiProfiles.find((p) => p.mediaId === m.id),
              policy,
            ),
          )
          .filter((r): r is NonNullable<typeof r> => r !== undefined),
      );
    },
  },
  ecos: {
    listInventory: () => ok(efx.legacyEcosInventory),
    listScenarios: (programId) => ok(efx.ecosScenarios.filter((s) => s.programId === programId)),
  },
  /*
   * Passeport en memoire : le mock ne conserve rien entre deux rechargements,
   * mais il repond avec la meme forme que Supabase pour que les ecrans se
   * developpent sans base.
   */
  /*
   * LA BOITE EST VIDE EN MAQUETTE, ET C'EST LA CORRECTION DU 09/09.
   *
   * Elle rendait TROIS MESSAGES ECRITS EN DUR — « Ouverture du module
   * Doppler », « Convocation a l'atelier de simulation » — servis a de vrais
   * etudiants en production. Pas une table vide qu'on aurait pu lire comme
   * « rien recu » : du contenu invente, date, plausible, indiscernable d'un
   * vrai message. C'est la troisieme nature de mock decrite le 04/09, la seule
   * qui MENT au lieu de se taire.
   *
   * Une liste vide dit la verite : la maquette n'a recu aucun message.
   */
  messages: {
    listMyMessages: () => ok([]),
    markRead: () => ok(undefined),
  },
  passport: {
    declareOutcomeLevel: (input) =>
      ok({
        enrollmentId: input.enrollmentId,
        outcomeId: input.outcomeId,
        declaredLevel: input.level,
        declaredAt: new Date().toISOString(),
        note: input.note ?? "",
      }),
    listSelfReports: () => ok([]),
    /* En session simulee, confirmer ne fait que rendre la declaration confirmee :
       aucune persistance, comme le reste du mock. */
    validateOutcomeDeclaration: (input) =>
      ok({
        enrollmentId: input.enrollmentId,
        outcomeId: input.outcomeId,
        declaredLevel: "autonomous" as const,
        declaredAt: new Date().toISOString(),
        note: "",
        validatedAt: new Date().toISOString(),
      }),
    revokeOutcomeValidation: (input) =>
      ok({
        enrollmentId: input.enrollmentId,
        outcomeId: input.outcomeId,
        declaredLevel: "autonomous" as const,
        declaredAt: new Date().toISOString(),
        note: "",
      }),
    /*
     * Le mock ne garde PAS les notes : une note qu'on croit ecrite et qui
     * disparait est exactement le defaut qu'on repare ici. En session simulee,
     * l'ecran affiche donc une boite vide -- ce qui est vrai.
     */
    listExperienceNotes: () => ok([]),
    saveExperienceNote: () => ok(undefined),
  },

  /*
   * LES FILS N'ONT PAS DE MAQUETTE, ET N'EN AURONT PAS.
   *
   * Une conversation inventee entre un etudiant et son encadrant est le pire
   * faux possible : elle se lit comme un vrai echange. Le mock rend donc vide,
   * et l'ecran dit qu'il n'y a pas encore d'echange -- ce qui est vrai. C'est
   * la lecon du 09/09 sur « Mes messages », appliquee d'avance cette fois.
   */
  /*
   * AUCUNE SOURCE EN SESSION SIMULEE, et surtout aucun faux jeton. Un ecran
   * qui montrerait une source « UMCV » configuree alors qu'aucune ne l'est
   * ferait croire la chaine branchee. L'ecran dira donc qu'il n'y a rien --
   * ce qui est vrai.
   */
  encadrementSources: {
    listSources: () => ok([]),
    listRuns: () => ok([]),
    setSource: () => {
      throw new Error("La configuration d'une source n'est pas disponible en session simulée.");
    },
    testSource: () => {
      throw new Error("Le test d'une source n'est pas disponible en session simulée.");
    },
    syncSource: () => {
      throw new Error("La synchronisation n'est pas disponible en session simulée.");
    },
  },

  discussions: {
    listThreads: () => ok([]),
    listThreadsForProgram: () => ok([]),
    listMessages: () => ok([]),
    postMessage: () => {
      throw new Error("Les échanges ne sont pas disponibles en session simulée.");
    },
    markThreadRead: () => ok(undefined),
  },

  plan: {
    listPlanSchedule: (programId) => {
      const ids = new Set(fx.outcomes.filter((o) => o.programId === programId).map((o) => o.id));
      return ok(fx.planSchedule.filter((s) => ids.has(s.outcomeId)));
    },
    /*
     * Le rétroplanning n'a pas de jeu de démonstration : la maquette du
     * Concepteur montrait des échéances qui n'existaient nulle part, et c'est
     * précisément ce qu'on est en train de corriger. Rendre une liste vide dit
     * la vérité — aucune promotion n'a encore de jalon.
     */
    /*
     * AUCUNE FIXTURE, MAIS UNE MEMOIRE DE SESSION. La maquette ne demarre sur
     * aucun jalon deplace — en rendre un ferait croire a un reamenagement que
     * personne n'a fait. En revanche ce que l'utilisateur deplace DOIT tenir :
     * sans cela, il tire une barre, l'ecran la remet en place, et l'interaction
     * passe pour cassee alors qu'elle marche.
     */
    listMilestoneShifts: (enrollmentId: EnrollmentId) =>
      ok([...(decalagesDeDemo.get(enrollmentId)?.values() ?? [])]),
    shiftMilestone: (input: {
      enrollmentId: EnrollmentId;
      milestoneId: PlanMilestoneId;
      dueOn: string;
      startsOn?: string;
    }) => {
      const decalage: MilestoneShift = {
        milestoneId: input.milestoneId,
        shiftedDueOn: input.dueOn,
        ...(input.startsOn ? { shiftedStartsOn: input.startsOn } : {}),
      };
      const pourCetteInscription =
        decalagesDeDemo.get(input.enrollmentId) ?? new Map<PlanMilestoneId, MilestoneShift>();
      pourCetteInscription.set(input.milestoneId, decalage);
      decalagesDeDemo.set(input.enrollmentId, pourCetteInscription);
      return ok(decalage);
    },
    resetMilestoneShift: (enrollmentId: EnrollmentId, milestoneId: PlanMilestoneId) => {
      decalagesDeDemo.get(enrollmentId)?.delete(milestoneId);
      return ok(undefined);
    },
    listMilestones: () => ok([]),
    createMilestone: () =>
      Promise.reject(new Error("Le rétroplanning exige une connexion à la base.")),
    updateMilestone: () =>
      Promise.reject(new Error("Le rétroplanning exige une connexion à la base.")),
    deleteMilestone: () =>
      Promise.reject(new Error("Le rétroplanning exige une connexion à la base.")),
    setMilestoneOutcomes: () =>
      Promise.reject(new Error("Le rétroplanning exige une connexion à la base.")),
    /*
     * Les modèles suivent le rétroplanning dont ils sont tirés : aucun jeu de
     * démonstration, et des écritures qui refusent. Un modèle de maquette
     * laisserait croire qu'on peut relever un calendrier sans base, alors que
     * relever suppose précisément des jalons enregistrés.
     */
    listTemplates: () => ok([]),
    saveTemplate: () =>
      Promise.reject(new Error("Les modèles de rétroplanning exigent une connexion à la base.")),
    updateTemplate: () =>
      Promise.reject(new Error("Les modèles de rétroplanning exigent une connexion à la base.")),
    deleteTemplate: () =>
      Promise.reject(new Error("Les modèles de rétroplanning exigent une connexion à la base.")),
    applyTemplate: () =>
      Promise.reject(new Error("Les modèles de rétroplanning exigent une connexion à la base.")),
  },
  /*
   * ECOS virtuel externe en memoire : la maquette declare et relit ses passages
   * le temps d'une session, avec la meme forme que Supabase (score recalcule).
   */
  ecosExternal: (() => {
    const runs: EcosExternalRun[] = [];
    const items = new Map<string, readonly EcosGridItem[]>();
    return {
      listRunsForEnrollment: (enrollmentId: EnrollmentId) =>
        ok(runs.filter((r) => r.enrollmentId === enrollmentId)),
      listRunsForProgram: (programId: ProgramId) =>
        ok(runs.filter((r) => r.programId === programId)),
      listRunItems: (runId: string) => ok(items.get(runId) ?? []),
      recordRun: (input) => {
        const enrollment = fx.enrollments.find((e) => e.id === input.enrollmentId);
        if (!enrollment) return Promise.reject(new Error("Inscription inconnue."));
        const id = `ecos-run-${runs.length + 1}`;
        runs.unshift({
          id,
          enrollmentId: input.enrollmentId,
          programId: enrollment.programId,
          stationKey: input.stationKey,
          stationLabel: input.stationLabel,
          playedOn: input.playedOn,
          score: input.items.reduce((a, i) => a + i.points, 0),
          maxScore: input.items.reduce((a, i) => a + i.maxPoints, 0),
          itemCount: input.items.length,
          createdAt: new Date().toISOString(),
        });
        items.set(id, input.items.map((i) => ({ ...i })));
        return ok(id);
      },
      deleteRun: (runId: string) => {
        const index = runs.findIndex((r) => r.id === runId);
        if (index >= 0) runs.splice(index, 1);
        items.delete(runId);
        return ok(undefined);
      },
    };
  })(),
  stageLogs: {
    listTemplates: (programId) =>
      ok(
        programId
          ? slfx.stageLogTemplates.filter((t) => t.programId === programId)
          : slfx.stageLogTemplates,
      ),
    listLogsForEnrollment: (enrollmentId) =>
      ok(slfx.stageLogs.filter((l) => l.enrollmentId === enrollmentId)),
    listLogsToValidate: (programId) => ok(slfx.stageLogs.filter((l) => l.programId === programId)),
    listLogsReceived: (programId) =>
      ok(
        slfx.stageLogs.filter(
          (l) =>
            l.programId === programId && (l.status === "validated" || l.status === "transmitted"),
        ),
      ),
    // Le mock ne persiste rien : ces quatre écritures sont sans effet, comme
    // tout le reste de ce fichier. Le backend Supabase, lui, écrit vraiment.
    saveStageLogDay: () => ok(undefined),
    deleteStageLogDay: () => ok(undefined),
    validateStageLogBlock: () => ok(undefined),
    openStageLogsForGroup: () => ok(undefined),
  },
  statistics: {
    listCohortStatistics: (programId) =>
      ok(stfx.cohortStatistics.filter((s) => s.programId === programId)),
  },
  clinicalAudits: {
    listTemplates: (programId) => ok(dpc.auditTemplates.filter((t) => t.programId === programId)),
    listCampaigns: (programId) => ok(dpc.auditCampaigns.filter((c) => c.programId === programId)),
    listSubmissions: (programId) => {
      const campaignIds = new Set(
        dpc.auditCampaigns.filter((c) => c.programId === programId).map((c) => c.id),
      );
      return ok(dpc.auditSubmissions.filter((s) => campaignIds.has(s.campaignId)));
    },
    listSubmissionsForEnrollment: (enrollmentId) =>
      ok(dpc.auditSubmissions.filter((s) => s.enrollmentId === enrollmentId)),
    listTests: (programId) => ok(dpc.prePostTests.filter((t) => t.programId === programId)),
    listTestResults: (programId) => {
      const testIds = new Set(
        dpc.prePostTests.filter((t) => t.programId === programId).map((t) => t.id),
      );
      return ok(dpc.prePostTestResults.filter((r) => testIds.has(r.testId)));
    },
    listSessions: (programId) => ok(dpc.teachingSessions.filter((s) => s.programId === programId)),
  },
  dpc: {
    listGrids: (programId) => ok(hvg.dpcHvgGrids.filter((g) => g.programId === programId)),
    getSetup: (programId) =>
      ok(hvg.dpcHvgSetup.programId === programId ? hvg.dpcHvgSetup : undefined),
    listRounds: (programId) => ok(hvg.dpcHvgRounds.filter((r) => r.programId === programId)),
    listEntries: (programId) => {
      const roundIds = new Set(
        hvg.dpcHvgRounds.filter((r) => r.programId === programId).map((r) => r.id),
      );
      return ok(hvg.dpcHvgEntries.filter((e) => roundIds.has(e.roundId)));
    },
    listEntriesForEnrollment: (enrollmentId) =>
      ok(hvg.dpcHvgEntries.filter((e) => e.enrollmentId === enrollmentId)),
    listSequences: (programId) =>
      ok(programId === hvg.DPC_HVG_PROGRAM_ID ? hvg.dpcHvgSequences : []),
    listQuestions: (programId) =>
      ok(programId === hvg.DPC_HVG_PROGRAM_ID ? hvg.dpcHvgQuestions : []),
    listTests: (programId) => ok(hvg.dpcHvgTests.filter((t) => t.programId === programId)),
    listTestAttempts: (programId) => {
      const testIds = new Set(
        hvg.dpcHvgTests.filter((t) => t.programId === programId).map((t) => t.id),
      );
      return ok(hvg.dpcHvgTestAttempts.filter((a) => testIds.has(a.testId)));
    },
    listAttendance: (programId) => {
      const sessionIds = new Set(
        hvg.dpcHvgSessions.filter((s) => s.programId === programId).map((s) => s.id),
      );
      return ok(hvg.dpcHvgAttendance.filter((a) => sessionIds.has(a.sessionId)));
    },
    listSessions: (programId) => ok(hvg.dpcHvgSessions.filter((s) => s.programId === programId)),
  },
  audit: {
    listRecentEvents: (limit = 20) => ok(fx.auditEvents.slice(0, limit)),
  },
};
