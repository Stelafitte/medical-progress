/**
 * Chargement du périmètre du RESPONSABLE DE STAGE.
 *
 * Le périmètre est calculé à partir des affectations dont la personne est
 * responsable : aucun étudiant hors de ces affectations n'est chargé.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { supervisedEnrollmentIds } from "@/domain/supervision";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { mergePlacements } from "@/domain/placementDraft";

export function useSupervision() {
  const data = useDataAccess();
  const { person, activeProgram } = useSession();
  /** Les terrains créés par l'administration en session sont visibles ici aussi. */
  const localPlacements = useLocalPlacements(activeProgram.id);

  return useQuery({
    queryKey: ["supervision", person.id, activeProgram.id, localPlacements.length],
    queryFn: async () => {
      const assignments = await data.placements.listAssignmentsForSupervisor(
        person.id,
        activeProgram.id,
      );
      const enrollmentIds = supervisedEnrollmentIds(assignments, person.id);
      const [storedPlacements, outcomes, enrollments, messages, logsToValidate] = await Promise.all(
        [
          data.placements.listPlacements(activeProgram.id),
          data.outcomes.listOutcomes(activeProgram.id),
          data.supervision.listEnrollmentsByIds(enrollmentIds),
          data.supervision.listMessages(activeProgram.id),
          data.stageLogs.listLogsToValidate(activeProgram.id),
        ],
      );
      const learners = await data.supervision.listPeopleByIds(enrollments.map((e) => e.personId));
      /*
       * LES DECLARATIONS, LUES ICI ET UNE SEULE FOIS (10/09).
       *
       * `listCompetenceConfirmations` etait un depot de MAQUETTE : il filtrait
       * sur `programId` et rendait donc VIDE avec l'identifiant reel. La vue
       * d'ensemble et « Mes etudiants » annonçaient 0 competence a confirmer
       * pendant que l'onglet Competences, lui branche sur `outcome_self_reports`,
       * en montrait des dizaines. Deux chiffres pour la meme question, c'est un
       * chiffre de trop : ils viennent desormais de la meme lecture.
       */
      const declarations = new Map(
        await Promise.all(
          enrollmentIds.map(async (id) => [id, await data.passport.listSelfReports(id)] as const),
        ),
      );

      return {
        assignments,
        enrollmentIds,
        enrollments,
        learners,
        placements: mergePlacements(storedPlacements, localPlacements),
        outcomes,
        logsToValidate,
        declarations,
        messages,
      };
    },
  });
}

export type SupervisionScope = NonNullable<ReturnType<typeof useSupervision>["data"]>;

/** Nom de l'apprenant rattaché à une inscription encadrée. */
export function learnerName(scope: SupervisionScope, enrollmentId: string): string {
  const enrollment = scope.enrollments.find((e) => e.id === enrollmentId);
  return scope.learners.find((p) => p.id === enrollment?.personId)?.fullName ?? "Apprenant";
}

/** Les competences du programme -- les connaissances ne se confirment pas. */
export function competencesDuProgramme(scope: SupervisionScope) {
  return scope.outcomes.filter((o) => o.nature !== "knowledge");
}

/** Ce que cet etudiant a declare et qui attend la confirmation de l'encadrant. */
export function aConfirmer(scope: SupervisionScope, enrollmentId: string): number {
  const declarees = scope.declarations.get(enrollmentId) ?? [];
  const competences = new Set(competencesDuProgramme(scope).map((o) => o.id as string));
  return declarees.filter((d) => competences.has(d.outcomeId) && d.validatedAt === undefined)
    .length;
}
