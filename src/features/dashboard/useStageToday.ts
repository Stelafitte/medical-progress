import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDataAccess, useSession } from "@/application/session";

/** La journee du jour en `AAAA-MM-JJ`, dans le fuseau du telephone. */
export function jourCourant(): string {
  const maintenant = new Date();
  const decale = new Date(maintenant.getTime() - maintenant.getTimezoneOffset() * 60000);
  return decale.toISOString().slice(0, 10);
}

/**
 * LE CARNET DE STAGE DU JOUR, POUR LE TABLEAU DE BORD.
 *
 * Lu a part du passeport : le carnet vit sur un autre rythme que le plan
 * d'acquisition, et l'etudiant coche sa journee bien plus souvent qu'il ne
 * declare un acquis. Le melanger au passeport ferait recharger 368 acquis a
 * chaque coche.
 *
 * L'EXISTENCE DE L'ENTREE EST LA PRESENCE (decision du 31/08) : le recit peut
 * rester vide, un geste suffit. `save_stage_log_day` est rejouable, donc
 * revenir sur sa journee pour y ajouter un commentaire ne cree pas de doublon.
 */
export function useStageToday() {
  const data = useDataAccess();
  const { activeEnrollment } = useSession();
  const jour = jourCourant();

  const carnets = useQuery({
    queryKey: ["stage-today", activeEnrollment?.id ?? "none"],
    enabled: Boolean(activeEnrollment),
    queryFn: async () => {
      if (!activeEnrollment) return [];
      return data.stageLogs.listLogsForEnrollment(activeEnrollment.id);
    },
  });

  /*
   * LE CARNET COURANT. On prend celui dont la periode contient aujourd'hui ;
   * a defaut le premier ouvert. Un etudiant peut en avoir plusieurs sur une
   * annee, et afficher le mauvais ferait pointer la journee sur le mauvais
   * terrain.
   */
  const carnet =
    (carnets.data ?? []).find(
      (log) =>
        log.periodStartsOn !== undefined &&
        log.periodEndsOn !== undefined &&
        log.periodStartsOn.slice(0, 10) <= jour &&
        jour <= log.periodEndsOn.slice(0, 10),
    ) ?? (carnets.data ?? [])[0];

  const entree = carnet?.entries.find((e) => e.occurredAt.slice(0, 10) === jour);

  const client = useQueryClient();
  const enregistrer = useMutation({
    mutationFn: async (narrative: string) => {
      if (!activeEnrollment) throw new Error("Aucune inscription active.");
      if (carnet?.placementId === undefined) {
        throw new Error("Ce carnet n'est rattaché à aucun terrain de stage.");
      }
      await data.stageLogs.saveStageLogDay({
        enrollmentId: activeEnrollment.id,
        placementId: carnet.placementId,
        occurredOn: jour,
        narrative,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["stage-today"] }),
  });

  return {
    jour,
    /*
     * LE NOMBRE DE JOURS CONSIGNES depuis l'ouverture du carnet. Source reelle :
     * `stage_log_entries`, une ligne par journee presente — l'existence de
     * l'entree EST la presence (decision du 31/08). Aucun chiffre invente : sans
     * carnet, il n'y a rien a compter et la tuile ne s'affiche pas.
     */
    joursConsignes: carnet?.entries.length ?? 0,
    isPending: carnets.isPending,
    /** Vrai quand la journee peut reellement etre enregistree. */
    ouvrable: carnet?.placementId !== undefined,
    carnet,
    entree,
    enregistrer,
  };
}
