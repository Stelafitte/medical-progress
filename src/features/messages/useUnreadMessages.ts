import { useQuery } from "@tanstack/react-query";

import { useDataAccess, useSession } from "@/application/session";
import { canAccessSupervision } from "@/domain/access";
import { nonLus } from "@/domain/communication";
import type { DiscussionThread } from "@/domain/types";

/** Le fil porte-t-il quelque chose que JE n'ai pas encore lu ? */
function filNonLu(fil: DiscussionThread): boolean {
  return fil.readAt === null || new Date(fil.readAt) < new Date(fil.lastMessageAt);
}

export interface NonLus {
  /** Annonces reçues et pas encore marquées lues (apprenant seulement). */
  readonly annonces: number;
  /** Fils portant un message que je n'ai pas lu. */
  readonly echanges: number;
  readonly total: number;
  /** Où mène la pastille, selon l'espace de la personne. */
  readonly destination: "/espace/messages" | "/espace/encadrement/messages" | null;
}

/**
 * LA PASTILLE DE NON-LUS — comptée une fois, lue partout (10/09).
 *
 * ⚠️ LES CLÉS DE CACHE SONT CELLES DES ÉCRANS, à l'identique. C'est tout
 * l'intérêt : quand la personne est sur sa messagerie, ce compteur ne déclenche
 * AUCUNE requête de plus — il lit ce que l'écran a déjà chargé, et il se met à
 * jour tout seul dès qu'un `invalidateQueries` part après une lecture. Une clé
 * légèrement différente aurait doublé le réseau ET fait diverger le compteur de
 * l'écran qu'il annonce.
 *
 * DEUX SOURCES, PAS UNE, parce qu'il y a deux modèles en base : les ANNONCES
 * (campagnes, marquées lues par un bouton) et les ÉCHANGES (fils, marqués lus
 * en s'ouvrant). Les additionner dans une seule pastille est légitime — la
 * personne veut savoir s'il y a quelque chose à lire — mais le détail reste
 * disponible pour l'écran, qui, lui, doit les distinguer.
 *
 * L'ENCADRANT N'A PAS D'ANNONCES : `listMyMessages` est la boîte de l'apprenant.
 * Un encadrant sans inscription ne déclenche donc que la lecture des fils.
 */
export function useUnreadMessages(): NonLus {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment, rolesForAccess } = useSession();

  const estApprenant = Boolean(activeEnrollment);
  const estEncadrant = canAccessSupervision(rolesForAccess, activeProgram.id);

  const { data: annonces } = useQuery({
    queryKey: ["learner-messages", activeProgram.id],
    queryFn: () => data.messages.listMyMessages(),
    enabled: estApprenant,
  });

  const { data: filsApprenant } = useQuery({
    queryKey: ["discussion-threads", activeEnrollment?.id ?? "none"],
    queryFn: () => data.discussions.listThreads(activeEnrollment!.id),
    enabled: estApprenant,
  });

  const { data: filsEncadrant } = useQuery({
    queryKey: ["discussion-threads", "programme", activeProgram.id],
    queryFn: () => data.discussions.listThreadsForProgram(activeProgram.id),
    enabled: estEncadrant,
  });

  const nonLusAnnonces = estApprenant ? nonLus(annonces ?? []) : 0;
  const nonLusEchanges =
    (estApprenant ? (filsApprenant ?? []).filter(filNonLu).length : 0) +
    (estEncadrant ? (filsEncadrant ?? []).filter(filNonLu).length : 0);

  return {
    annonces: nonLusAnnonces,
    echanges: nonLusEchanges,
    total: nonLusAnnonces + nonLusEchanges,
    /*
     * L'APPRENANT D'ABORD quand la personne est les deux. C'est le cas de Stef
     * en test, et ce sera celui d'un interne qui encadre : sa propre boîte le
     * concerne avant celle qu'il surveille.
     */
    destination: estApprenant
      ? "/espace/messages"
      : estEncadrant
        ? "/espace/encadrement/messages"
        : null,
  };
}
