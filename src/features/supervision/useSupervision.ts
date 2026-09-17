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
      const [
        storedPlacements,
        outcomes,
        themes,
        enrollments,
        logsToValidate,
        groups,
        weeks,
        resources,
        roleAssignments,
        staffProfiles,
      ] = await Promise.all([
        data.placements.listPlacements(activeProgram.id),
        data.outcomes.listOutcomes(activeProgram.id),
        /*
         * LES THEMES, LUS ICI DEPUIS LE 11/09. Ils ne servent pas a decorer :
         * une promotion porte des dizaines d'acquis, et une liste a plat de
         * dizaines de lignes ne se lit pas. Le theme est le seul regroupement
         * que le programme declare lui-meme -- on ne le devine pas depuis le
         * code de l'acquis.
         */
        data.outcomes.listOutcomeThemes(activeProgram.id),
        data.supervision.listEnrollmentsByIds(enrollmentIds),
        data.stageLogs.listLogsToValidate(activeProgram.id),
        /*
         * LES GROUPES ET LEUR CALENDRIER. Lus par l'encadrant, pas seulement
         * par l'administration : c'est le groupe qui dit a quelles semaines
         * ses etudiants etaient attendus dans le service. La RLS borne la
         * portee -- `is_program_staff` inclut `placement_supervisor`.
         */
        data.placements.listSupervisionGroups(activeProgram.id),
        data.placements.listSupervisionGroupWeeks(activeProgram.id),
        /*
         * LES SUPPORTS DU PROGRAMME (11/09). L'encadrant doit voir le contenu
         * EXACTEMENT comme l'etudiant le recoit -- c'est la source qu'on lui
         * demande de verifier. Aucune methode serveur ne rend « les supports de
         * cet acquis » : chaque `LearningResource` porte ses `outcomeIds`, et
         * l'ecran apprenant renverse la liste en memoire. On fait pareil, pour
         * lire la meme chose par le meme chemin.
         *
         * LE DROIT SUIT : `can_read_resource` accepte `is_program_staff`, qui
         * inclut l'encadrant. Un non-inscrit hors staff recevrait zero ligne
         * SANS ERREUR -- le vide credible, encore.
         */
        data.resources.listResources(activeProgram.id),
        /*
         * L'EQUIPE DU PROGRAMME (11/09, demande de Stef : « il faudrait que
         * l'encadrant voie qui sont les autres encadrants et le responsable du
         * stage »). Deux lectures ordinaires -- les roles et les profils -- que
         * la RLS borne toute seule : depuis la migration `20260911200000`, qui
         * est staff d'un programme voit les roles de ce programme et les
         * profils de ceux qui les portent. Aucun filtre de perimetre n'est
         * ecrit ici, et c'est voulu : un filtre d'ecran donnerait l'illusion
         * d'une regle qui vit en base.
         */
        data.administration.listAllRoleAssignments(),
        data.administration.listPeople(),
      ]);
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
        themes,
        logsToValidate,
        declarations,
        groups,
        weeks,
        resources,
        roleAssignments,
        staffProfiles,
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

/** Les connaissances du programme -- elles se suivent, elles ne se confirment pas. */
export function connaissancesDuProgramme(scope: SupervisionScope) {
  return scope.outcomes.filter((o) => o.nature === "knowledge");
}

/**
 * Range des acquis par theme, dans l'ordre declare par le programme.
 *
 * LES ACQUIS SANS THEME NE SONT PAS PERDUS : ils forment un dernier groupe
 * explicite. Les taire ferait disparaitre de l'ecran des acquis qui existent --
 * et un encadrant qui ne voit pas une competence croit qu'elle n'est pas au
 * programme.
 */
export function parTheme<T extends { themeId?: string; position?: number; code: string }>(
  scope: SupervisionScope,
  acquis: readonly T[],
): readonly { id: string; label: string; acquis: readonly T[] }[] {
  const themes = [...scope.themes].sort((a, b) => a.position - b.position);
  const groupes = themes.map((t) => ({
    id: t.id as string,
    label: t.label,
    acquis: acquis
      .filter((o) => o.themeId === (t.id as string))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.code.localeCompare(b.code, "fr")),
  }));
  const orphelins = acquis
    .filter((o) => o.themeId === undefined || !themes.some((t) => (t.id as string) === o.themeId))
    .sort((a, b) => a.code.localeCompare(b.code, "fr"));
  if (orphelins.length > 0) {
    groupes.push({ id: "sans-theme", label: "Hors chapitre", acquis: orphelins });
  }
  return groupes.filter((g) => g.acquis.length > 0);
}

/**
 * Les supports qui traitent d'un acquis, dans l'ordre ou l'apprenant les voit.
 *
 * LE FILTRAGE EST EN MEMOIRE, ET CE N'EST PAS UN RACCOURCI : le rattachement
 * vit dans `learning_resource_outcomes`, lu une fois par `listResources` qui
 * remplit `outcomeIds`. Aucune methode ne part d'un acquis -- l'ecran apprenant
 * renverse la meme liste.
 */
export function supportsDeLAcquis(scope: SupervisionScope, outcomeId: string) {
  return scope.resources.filter((r) => (r.outcomeIds as readonly string[]).includes(outcomeId));
}

/** Ce que cet etudiant a declare et qui attend la confirmation de l'encadrant. */
export function aConfirmer(scope: SupervisionScope, enrollmentId: string): number {
  const declarees = scope.declarations.get(enrollmentId) ?? [];
  const competences = new Set(competencesDuProgramme(scope).map((o) => o.id as string));
  return declarees.filter((d) => competences.has(d.outcomeId) && d.validatedAt === undefined)
    .length;
}

/**
 * Le calendrier « en service / chez soi » d'un etudiant, par le groupe dont il
 * est membre. `undefined` quand aucune semaine n'a ete posee : le calendrier de
 * presence le dit alors, plutot que de deviner.
 */
export function semainesDeLEtudiant(
  scope: SupervisionScope,
  enrollmentId: string,
): ReadonlyMap<string, "on" | "off"> | undefined {
  const groupe = scope.groups.find((g) =>
    (g.memberEnrollmentIds as readonly string[]).includes(enrollmentId),
  );
  if (!groupe) return undefined;
  const siennes = scope.weeks.filter((w) => w.groupId === groupe.id);
  if (siennes.length === 0) return undefined;
  return new Map(siennes.map((w) => [w.weekStart, w.kind] as const));
}
