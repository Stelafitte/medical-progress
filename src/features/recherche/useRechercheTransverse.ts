/**
 * Les deux lectures de la recherche transverse.
 *
 * ELLES SONT SÉPARÉES EXPRÈS. Le matériel — les acquis, les modalités, les
 * messages, le carnet — ne dépend pas de ce qu'on tape : le charger une fois et
 * le garder en cache évite de rappeler le serveur à chaque lettre. Les passages
 * du cours, eux, dépendent de la requête et d'elle seule.
 *
 * ELLES NE PASSENT PLUS PAR `useLearnerPassport` (14/09 au soir). Ce hook exige
 * une INSCRIPTION ACTIVE : la recherche n'aurait donc rien rendu à un encadrant
 * ni à un administrateur, alors que l'outil est ouvert à tous les profils. Le
 * matériel du PROGRAMME se lit directement ; ce qui appartient à une personne
 * n'est lu que si cette personne est inscrite.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { appliquerDecalages } from "@/domain/acquisitionPlan";
import { motsDeLaRequete } from "@/domain/rechercheTransverse";
import type { PlanScheduleEntry } from "@/domain/acquisitionPlan";
import type { StageLog } from "@/domain/stageLog";

/**
 * Ce qu'on demande au serveur tant que le bloc n'est pas déplié. La fonction
 * rend AUSSI le total exact, donc dix lignes suffisent à remplir le bloc.
 */
export const LIMITE_SECTIONS = 10;

/**
 * Ce qu'on demande quand l'étudiant déplie. **C'est le plafond de la fonction
 * serveur** (`least(coalesce(p_limit, 10), 50)`) : demander plus rendrait
 * exactement la même chose, et l'écran promettrait ce que la base ne rend pas.
 */
export const LIMITE_SECTIONS_DEPLIEE = 50;

/** Ce qui ne dépend pas de la requête : chargé une fois par programme. */
export function useMaterielDeRecherche() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const estInscrit = Boolean(activeEnrollment);

  return useQuery({
    queryKey: ["recherche-materiel", activeProgram.id, activeEnrollment?.id ?? "aucune"],
    queryFn: async () => {
      /*
       * LES TROIS PREMIÈRES LECTURES VALENT POUR TOUS LES PROFILS. Ce sont des
       * lectures de PROGRAMME, bornées par la RLS : chacun n'en reçoit que ce
       * qu'il a déjà le droit de lire ailleurs dans l'application.
       * `listMyMessages` ne prend pas d'inscription — un encadrant reçoit ses
       * propres messages comme un apprenant reçoit les siens.
       */
      const [outcomes, modalites, messages] = await Promise.all([
        data.outcomes.listOutcomes(activeProgram.id),
        data.assessments.listAssessmentModalities(activeProgram.id),
        data.messages.listMyMessages(),
      ]);

      /*
       * CE QUI SUIT N'APPARTIENT QU'À UN INSCRIT : son carnet, et son
       * rétroplanning avec SES décalages. On ne le demande pas pour les autres
       * profils — non par prudence, mais parce que la question n'a pas de sens :
       * un administrateur n'a ni carnet ni promotion.
       */
      let carnets: readonly StageLog[] = [];
      let jalons: readonly PlanScheduleEntry[] = [];
      if (activeEnrollment) {
        const [carnetsLus, reference, decalages] = await Promise.all([
          data.stageLogs.listLogsForEnrollment(activeEnrollment.id),
          data.plan.listPlanSchedule(activeProgram.id, activeEnrollment.cohortId),
          data.plan.listMilestoneShifts(activeEnrollment.id),
        ]);
        carnets = carnetsLus;
        /*
         * LES DÉCALAGES SONT APPLIQUÉS ICI, comme partout ailleurs : le
         * Passeport, le Calendrier, le Gantt et le Kanban partent tous du même
         * état. Le jour où un écran l'oublierait, l'étudiant lirait deux
         * calendriers différents sans savoir lequel croire.
         */
        jalons = appliquerDecalages(reference, decalages);
      }

      return { outcomes, modalites, messages, carnets, jalons, estInscrit };
    },
  });
}

/** Ce qui dépend de la requête : le texte 2026, cherché côté serveur. */
export function useSectionsTrouvees(requete: string, limite: number = LIMITE_SECTIONS) {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const mots = motsDeLaRequete(requete);

  return useQuery({
    /*
     * LA LIMITE FAIT PARTIE DE LA CLÉ : sans elle, déplier le bloc rendrait le
     * résultat déjà en cache — dix passages — et le bouton n'aurait aucun effet
     * visible, ce qui se lit comme une panne.
     */
    queryKey: ["recherche-sections", activeProgram.id, mots.join(" "), limite],
    /*
     * PAS D'APPEL SUR UNE REQUÊTE VIDE. La fonction serveur rend zéro ligne
     * dans ce cas — elle est écrite pour — mais l'aller-retour serait payé
     * pour rien, et l'écran afficherait un chargement au premier caractère.
     */
    enabled: mots.length > 0,
    queryFn: () => data.resources.searchProgramSections(activeProgram.id, requete, limite),
  });
}
