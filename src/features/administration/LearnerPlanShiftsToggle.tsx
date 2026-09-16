import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDataAccess } from "@/application/session";
import type { ProgramId } from "@/domain/types";

/**
 * L'ETUDIANT PEUT-IL REAMENAGER SON PROPRE PLAN ? (Stef, 09/09 : « l'etudiant
 * doit pouvoir, SI AUTORISE PAR L'ADMIN PROGRAMME, modifier les jalons ».)
 *
 * POURQUOI L'INTERRUPTEUR EST ICI, sur l'ecran du retroplanning, et non dans
 * un panneau de reglages. C'est ici qu'un administrateur pose les dates de la
 * promotion ; la question « et l'etudiant, peut-il les bouger pour lui ? » se
 * pose dans le meme geste et sur le meme ecran. Rangee ailleurs, elle serait
 * decidee sans voir le calendrier qu'elle concerne.
 *
 * LE PROGRAMME, PAS LA PROMOTION. Les jalons appartiennent a une promotion,
 * mais l'autorisation est un choix pedagogique d'etablissement : ouvrir le
 * reamenagement pour une promo et le fermer pour la suivante ne repond a
 * aucun besoin exprime, et ferait deux regles la ou une suffit. La colonne est
 * sur `programs`, a cote de `placements_enabled` et `dpc_enabled`.
 *
 * CE QUE L'ECRAN NE PROTEGE PAS, ET N'A PAS A PROTEGER. `shift_milestone`
 * refuse elle-meme un programme ferme, un jalon officiel et une inscription
 * qui n'est pas la sienne. Cet interrupteur EXPRIME la decision ; il ne
 * l'applique pas. C'est la difference entre un reglage et un garde-fou.
 */
export function LearnerPlanShiftsToggle({ programId }: { readonly programId: ProgramId }) {
  const data = useDataAccess();
  const queryClient = useQueryClient();

  const { data: programme, isPending } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => data.programs.getProgram(programId),
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => data.programs.setLearnerPlanShifts(programId, enabled),
    onSuccess: (suivant) => {
      queryClient.setQueryData(["program", programId], suivant);
      void queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast.success(
        suivant.config.learnerPlanShiftsEnabled === true
          ? "Les apprenants peuvent réaménager leur plan."
          : "Le réaménagement du plan est refermé.",
      );
    },
    onError: (reason) =>
      toast.error(reason instanceof Error ? reason.message : "Réglage non enregistré."),
  });

  if (isPending) return <Skeleton className="h-16 w-full" />;
  if (!programme) return null;

  const ouvert = programme.config.learnerPlanShiftsEnabled === true;

  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-start gap-3 rounded-lg border p-4">
      <CalendarClock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="learner-plan-shifts" className="text-sm font-medium">
          Laisser les apprenants réaménager leur plan
        </Label>
        <p className="text-muted-foreground text-xs">
          Chaque étudiant peut alors déplacer ses propres échéances dans son diagramme de Gantt.
          Cela ne touche ni ce rétroplanning, ni le plan des autres inscrits : chacun réaménage le
          sien. Les jalons marqués <strong className="font-medium">officiels</strong> restent
          indéplaçables, et revenir à la date de la promotion reste toujours possible.
        </p>
        {ouvert ? null : (
          <p className="text-muted-foreground text-xs">
            Fermé : les apprenants suivent les dates de leur promotion, sans pouvoir les modifier.
          </p>
        )}
      </div>
      <Switch
        id="learner-plan-shifts"
        checked={ouvert}
        disabled={mutation.isPending}
        onCheckedChange={(valeur) => mutation.mutate(valeur)}
        aria-label="Laisser les apprenants réaménager leur plan"
      />
    </div>
  );
}
