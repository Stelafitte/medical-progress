import { useQuery } from "@tanstack/react-query";
import { useDataAccess, useSession } from "@/application/session";

/** Les promotions du programme actif — même clé de cache que les autres écrans. */
export function usePromotionsDuProgramme() {
  const { activeProgram } = useSession();
  const data = useDataAccess();
  return useQuery({
    queryKey: ["cohorts", activeProgram.id],
    queryFn: () => data.programs.listCohorts(activeProgram.id),
    staleTime: 60_000,
  });
}
