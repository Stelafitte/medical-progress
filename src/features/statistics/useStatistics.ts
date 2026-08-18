/**
 * Chargement des statistiques longitudinales du programme actif.
 * Le périmètre d'un responsable de stage est restreint à ses stages.
 */
import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";
import { buildTrend, scopedToPlacements, summarizeHistory } from "@/domain/statistics";

export function useStatistics() {
  const data = useDataAccess();
  const { person, activeProgram, canAccessProgramAdministration, canAccessPlatformAdministration } =
    useSession();
  const isProgramWide = canAccessProgramAdministration || canAccessPlatformAdministration;

  return useQuery({
    queryKey: ["statistics", activeProgram.id, person.id, isProgramWide],
    queryFn: async () => {
      const [snapshots, assignments, placements] = await Promise.all([
        data.statistics.listCohortStatistics(activeProgram.id),
        data.placements.listAssignmentsForSupervisor(person.id, activeProgram.id),
        data.placements.listPlacements(activeProgram.id),
      ]);

      const supervisedPlacementIds = [
        ...new Set(
          assignments.map((a) => a.placementId).filter((id) => placements.some((p) => p.id === id)),
        ),
      ];

      const visible = isProgramWide
        ? snapshots
        : scopedToPlacements(snapshots, supervisedPlacementIds);

      return {
        isProgramWide,
        supervisedPlacementIds,
        placements,
        snapshots: visible,
        trend: buildTrend(visible),
        summary: summarizeHistory(visible),
      };
    },
  });
}

export type StatisticsScope = NonNullable<ReturnType<typeof useStatistics>["data"]>;
