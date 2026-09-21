import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Notebook } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDataAccess, useSession } from "@/application/session";
import type { ProgramId } from "@/domain/types";

/**
 * LE MODULE « STAGES » DU PROGRAMME (21/09). `placements_enabled` ouvre ou
 * ferme l'onglet « Mon carnet de stage » des étudiants. La colonne existait
 * depuis le 21/08 ; seul un interrupteur de maquette (perdu au rechargement)
 * prétendait la régler. Même patron que `LearnerPlanShiftsToggle` : la base
 * relit, l'écran affiche ce qu'elle rend.
 *
 * POURQUOI ICI, dans « Gestion des stages » : c'est là qu'on décide qu'un
 * programme a des stages. Un programme sans stage (un DIU théorique, par
 * exemple) ferme le module ; les terrains et groupes restent, rien n'est effacé.
 */
export function PlacementsModuleToggle({ programId }: { readonly programId: ProgramId }) {
  const data = useDataAccess();
  const { reloadSession } = useSession();
  const queryClient = useQueryClient();

  const { data: programme, isPending } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => data.programs.getProgram(programId),
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => data.programs.setPlacementsEnabled(programId, enabled),
    onSuccess: (suivant) => {
      queryClient.setQueryData(["program", programId], suivant);
      void queryClient.invalidateQueries({ queryKey: ["programs"] });
      void reloadSession();
      toast.success(
        suivant.config.placementsEnabled
          ? "Le carnet de stage est ouvert aux étudiants."
          : "Le carnet de stage est fermé pour les étudiants.",
      );
    },
    onError: (reason) =>
      toast.error(reason instanceof Error ? reason.message : "Réglage non enregistré."),
  });

  if (isPending) return <Skeleton className="h-16 w-full" />;
  if (!programme) return null;

  const ouvert = programme.config.placementsEnabled;

  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-start gap-3 rounded-lg border p-4">
      <Notebook className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="placements-module" className="text-sm font-medium">
          Module stages actif pour les étudiants
        </Label>
        <p className="text-muted-foreground text-xs">
          {ouvert
            ? "Les étudiants voient l'onglet « Mon carnet de stage » et y déclarent leurs journées."
            : "Fermé : les étudiants ne voient pas de carnet de stage. Terrains, groupes et carnets déjà ouverts sont conservés."}
        </p>
      </div>
      <Switch
        id="placements-module"
        checked={ouvert}
        disabled={mutation.isPending}
        onCheckedChange={(valeur) => mutation.mutate(valeur)}
        aria-label="Module stages actif pour les étudiants"
      />
    </div>
  );
}
