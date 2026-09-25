/**
 * Chargement du périmètre de l'ADMINISTRATION DU PROGRAMME sélectionné.
 * Tout est filtré par programme : aucun autre programme n'est chargé.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { fetchProgramDirectory } from "@/infrastructure/supabase/communicationDirectory";
import type { OutcomeSelfReport } from "@/domain/passport";
import type { LearnerCourseOpens, LearnerQuestionResults } from "@/application/ports/repositories";

export function useProgramAdmin() {
  const data = useDataAccess();
  const { activeProgram } = useSession();

  return useQuery({
    queryKey: ["program-admin", activeProgram.id],
    queryFn: async () => {
      const [
        program,
        versions,
        cohorts,
        outcomes,
        outcomeThemes,
        assessmentModalities,
        assessmentSessions,
        cohortAssessmentLinks,
        questionBanks,
        resources,
        media,
        aiProfiles,
        aiPolicy,
        ecosInventory,
        ecosScenarios,
        planSchedule,
        placements,
        assignments,
        groups,
        templates,
        logsReceived,
        stageLogs,
        documentRequirements,
        documents,
        certificates,
        tasks,
        messageTemplates,
        sendHistory,
        alerts,
        enrollments,
        people,
        pendingPeople,
        roleAssignments,
        auditEvents,
      ] = await Promise.all([
        data.programs.getProgram(activeProgram.id),
        data.programs.listCurriculumVersions(activeProgram.id),
        data.programs.listCohorts(activeProgram.id),
        data.outcomes.listOutcomes(activeProgram.id),
        // Les thèmes servent à REPLIER les listes d'acquis : 327 connaissances
        // à plat ne se lisent pas, 22 chapitres qui s'ouvrent si.
        data.outcomes.listOutcomeThemes(activeProgram.id),
        data.assessments.listAssessmentModalities(activeProgram.id),
        data.assessments.listAssessmentSessions(activeProgram.id),
        data.assessments.listCohortAssessmentLinks(activeProgram.id),
        data.assessments.questionBankSummary(activeProgram.id),
        data.resources.listResources(activeProgram.id),
        data.media.listMedia(activeProgram.id),
        data.contentAi.listProfiles(activeProgram.id),
        data.contentAi.getPolicy(activeProgram.id),
        data.ecos.listInventory(),
        data.ecos.listScenarios(activeProgram.id),
        data.plan.listPlanSchedule(activeProgram.id),
        data.placements.listPlacements(activeProgram.id),
        data.placements.listAssignmentsForProgram(activeProgram.id),
        data.placements.listSupervisionGroups(activeProgram.id),
        data.stageLogs.listTemplates(activeProgram.id),
        data.stageLogs.listLogsReceived(activeProgram.id),
        data.stageLogs.listLogsToValidate(activeProgram.id),
        data.administration.listDocumentRequirements(activeProgram.id),
        data.administration.listDocuments(activeProgram.id),
        data.administration.listCertificates(activeProgram.id),
        data.administration.listTasks(activeProgram.id),
        data.administration.listMessageTemplates(activeProgram.id),
        data.administration.listSendHistory(activeProgram.id),
        data.supervision.listAlerts(activeProgram.id),
        data.administration.listAllEnrollments(activeProgram.id),
        data.administration.listPeople(),
        data.peopleStaging.listPendingPeople(activeProgram.id),
        data.administration.listAllRoleAssignments(),
        data.audit.listRecentEvents(50, activeProgram.id),
      ]);

      /*
       * LES VRAIS CHIFFRES DU SUIVI (21/09). Le tableau croise du Pilotage et
       * les vues Competences / Connaissances INVENTAIENT leurs valeurs (hachage
       * stable, « maquette deterministe ») : Stef a vu des statistiques
       * d'activite pour des etudiants jamais connectes. Deux lectures reelles
       * les remplacent : les declarations de la promotion, et la derniere
       * connexion de chacun. Un echec de lecture rend du VIDE, jamais du faux.
       */
      const [declarationsList, directory, qcmParCohorte, coursParCohorte] = await Promise.all([
        data.passport
          .listSelfReportsForEnrollments(enrollments.map((e) => e.id))
          .catch(() => [] as readonly OutcomeSelfReport[]),
        data.isMock ? Promise.resolve([]) : fetchProgramDirectory(activeProgram.id).catch(() => []),
        /*
         * CE QUE LES ETUDIANTS ONT REELLEMENT FAIT (25/09) : les reponses aux
         * QCM et les cours ouverts. Les deux lectures sont bornees a UNE
         * promotion cote serveur ; on les fait donc promotion par promotion et
         * on les remet a plat ici, pour que tout ecran du programme y ait acces
         * sans refaire la requete. Un refus rend une liste vide : la colonne se
         * tait, le tableau de suivi tient debout.
         */
        Promise.all(
          cohorts.map((c) =>
            data.assessments
              .questionResultsByLearner(c.id as string)
              .catch(() => [] as readonly LearnerQuestionResults[]),
          ),
        ),
        Promise.all(
          cohorts.map((c) =>
            data.statistics
              .listCourseOpensByLearner(c.id as string)
              .catch(() => [] as readonly LearnerCourseOpens[]),
          ),
        ),
      ]);
      const qcmByEnrollment = new Map<string, LearnerQuestionResults>();
      for (const ligne of qcmParCohorte.flat()) qcmByEnrollment.set(ligne.enrollmentId, ligne);
      const courseOpensByEnrollment = new Map<string, LearnerCourseOpens>();
      for (const ligne of coursParCohorte.flat())
        courseOpensByEnrollment.set(ligne.enrollmentId, ligne);
      const declarations = new Map<string, OutcomeSelfReport[]>();
      for (const report of declarationsList) {
        const key = report.enrollmentId as string;
        declarations.set(key, [...(declarations.get(key) ?? []), report]);
      }
      const lastSignInByPerson = new Map<string, string>();
      for (const row of directory) {
        if (row.personId && row.lastSignInAt)
          lastSignInByPerson.set(row.personId, row.lastSignInAt);
      }

      return {
        declarations,
        qcmByEnrollment,
        courseOpensByEnrollment,
        lastSignInByPerson,
        program,
        versions,
        cohorts,
        outcomes,
        outcomeThemes,
        assessmentModalities,
        assessmentSessions,
        cohortAssessmentLinks,
        questionBanks,
        resources,
        media,
        aiProfiles,
        aiPolicy,
        ecosInventory,
        ecosScenarios,
        planSchedule,
        placements,
        assignments,
        groups,
        templates,
        logsReceived,
        stageLogs,
        documentRequirements,
        documents,
        certificates,
        tasks,
        messageTemplates,
        sendHistory,
        alerts,
        enrollments,
        people,
        pendingPeople,
        roleAssignments,
        auditEvents,
      };
    },
  });
}

export type ProgramAdminScope = NonNullable<ReturnType<typeof useProgramAdmin>["data"]>;

export function personNameFor(scope: ProgramAdminScope, enrollmentId: string): string {
  const enrollment = scope.enrollments.find((e) => e.id === enrollmentId);
  return scope.people.find((p) => p.id === enrollment?.personId)?.fullName ?? "Apprenant";
}
