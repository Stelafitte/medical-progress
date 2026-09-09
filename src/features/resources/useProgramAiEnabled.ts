import { useQuery } from "@tanstack/react-query";

import { useDataAccess, useSession } from "@/application/session";

/**
 * L'ASSISTANT EST-IL OUVERT SUR CE PROGRAMME ?
 *
 * CE QUI MANQUAIT (09/09). Le reglage existait en base depuis le 03/09 et
 * l'ecran d'administration sait l'ecrire depuis ce matin, mais AUCUN ecran
 * apprenant ne le lisait : `AiCompanionInline` etait monte sans condition.
 * Fermer l'IA laissait donc l'outil affiche, et l'etudiant recevait une erreur
 * brute au premier envoi — la seule facon d'apprendre que c'etait ferme.
 *
 * ON MASQUE, ON NE GRISE PAS (decision de Stef, 09/09). Un champ grise invite a
 * demander pourquoi ; un enseignement ou l'IA n'est pas ouverte n'a pas a
 * exhiber son absence a chaque ligne.
 *
 * PENDANT LE CHARGEMENT, ON REPOND `false`. C'est le sens du defaut en base —
 * l'absence de reglage vaut refus — et cote ecran cela evite le battement ou
 * l'assistant apparait puis disparait. Il apparait une fois, quand on sait.
 *
 * LA RLS FAIT L'AUTORISATION : `program_ai_settings_select` ouvre la lecture au
 * personnel du programme ET a ses inscrits. Un quota qu'on ne peut pas lire est
 * un quota qu'on subit.
 */
export function useProgramAiEnabled(): boolean {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const { data: settings } = useQuery({
    queryKey: ["program-ai", activeProgram.id],
    queryFn: () => data.programAi.getSettings(activeProgram.id),
  });
  return settings?.enabled ?? false;
}
