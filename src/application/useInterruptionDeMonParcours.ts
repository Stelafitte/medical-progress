/**
 * L'INTERRUPTION EN COURS SUR LE PARCOURS DE LA PERSONNE CONNECTÉE.
 *
 * Le bandeau ET la coque en ont besoin — l'un pour l'annoncer, l'autre pour
 * cacher le programme quand il est suspendu. Une seule lecture, une seule clé :
 * deux requêtes finiraient par se contredire, et l'écran dirait « suspendu »
 * au-dessus d'un parcours qui marche.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { cleInterruptions } from "@/features/administration/cohortInterruptionQuery";
import { interruptionEnCours } from "@/domain/cohortInterruption";
import type { CohortId } from "@/domain/types";

export function useInterruptionDeMonParcours() {
  const session = useSession();
  const dataAccess = useDataAccess();
  const cohortId = session.activeEnrollment?.cohortId;

  const interruptions = useQuery({
    queryKey: cleInterruptions(cohortId ?? "aucune"),
    enabled: Boolean(cohortId),
    queryFn: () => dataAccess.programs.listCohortInterruptions(cohortId as CohortId),
    /*
      ⚠️ LE BANDEAU RESTAIT AFFICHÉ APRÈS LA REPRISE (Stef, 16/09 au soir :
      « reste le message parcours en pause alors que reprise faite »).

      La coque ne se démonte jamais tant qu'on navigue dans l'application : la
      requête n'était donc relue ni au changement d'onglet, ni après la reprise
      décidée depuis un AUTRE compte. L'invalidation posée côté administrateur
      ne traverse évidemment pas la session de l'étudiant.

      Un bandeau qui annonce un blocage ne peut pas retarder : il se relit tout
      seul chaque minute, et au retour sur la fenêtre. C'est le seul endroit de
      l'application où l'on préfère une requête de trop à une minute de retard.
    */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const enCours = interruptionEnCours(interruptions.data ?? []);
  const estPersonnel = session.canAccessProgramAdministration || session.canAccessSupervision;
  return { enCours, estPersonnel };
}
