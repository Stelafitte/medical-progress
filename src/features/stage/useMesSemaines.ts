import { useQuery } from "@tanstack/react-query";

import { useDataAccess, useSession } from "@/application/session";
import type { PlacementId, SupervisionGroup } from "@/domain/types";

/**
 * MON GROUPE, ET LES SEMAINES QU'IL PORTE.
 *
 * Une seule lecture pour les deux écrans de l'apprenant : le bloc « dans quel
 * groupe suis-je » et le carnet de la semaine. Les dupliquer aurait fini par
 * les faire diverger -- et surtout, le carnet a besoin du calendrier autant que
 * le bloc de choix : sans lui, il réclame cinq journées à un étudiant qui
 * n'était pas attendu dans le service.
 *
 * `semaines` vide = calendrier non posé. Ce n'est PAS « tout en service » :
 * les écrans distinguent les deux, parce qu'ils n'autorisent pas les mêmes
 * conclusions.
 */
export function useMesSemaines(placementId: PlacementId | undefined) {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();

  const groupes = useQuery({
    queryKey: ["supervision-groups", activeProgram.id],
    queryFn: () => data.placements.listSupervisionGroups(activeProgram.id),
  });

  const semaines = useQuery({
    queryKey: ["supervision-group-weeks", activeProgram.id],
    queryFn: () => data.placements.listSupervisionGroupWeeks(activeProgram.id),
  });

  const candidats: readonly SupervisionGroup[] =
    placementId === undefined || !activeEnrollment
      ? []
      : (groupes.data ?? []).filter(
          (g) => g.placementId === placementId && g.cohortId === activeEnrollment.cohortId,
        );

  const mien = activeEnrollment
    ? candidats.find((g) =>
        (g.memberEnrollmentIds as readonly string[]).includes(activeEnrollment.id),
      )
    : undefined;

  const miennes = new Map(
    (semaines.data ?? [])
      .filter((w) => w.groupId === mien?.id)
      .map((w) => [w.weekStart, w.kind] as const),
  );

  return {
    isPending: groupes.isPending,
    candidats,
    mien,
    /** Le calendrier de MON groupe, vide tant que rien n'a été posé. */
    semaines: miennes as ReadonlyMap<string, "on" | "off">,
    /** Le calendrier d'un groupe quelconque, pour comparer avant de choisir. */
    semainesDuGroupe: (groupId: string) =>
      (semaines.data ?? []).filter((w) => w.groupId === groupId),
  };
}
