import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import type { PlacementId, SupervisionGroupId } from "@/domain/types";

/**
 * « DANS QUEL GROUPE SUIS-JE ? » — l'étudiant se place lui-même (10/09).
 *
 * POURQUOI LUI ET PAS L'ADMINISTRATION. Les étudiants savent entre eux qui est
 * dans quelle moitié ; l'administration, non. Décision de Stef.
 *
 * ⚠️ CE QUE LE GROUPE DÉCIDE, ET QU'IL FAUT DIRE. Le groupe porte le calendrier
 * « semaine en service / semaine chez soi » : c'est lui qui dit quelles semaines
 * on attendait l'étudiant. Se tromper de groupe, c'est voir des journées
 * signalées manquantes à tort — ou l'inverse. L'écran l'annonce, plutôt que de
 * laisser découvrir la conséquence après coup.
 *
 * LE CHANGEMENT RESTE POSSIBLE EN COURS DE STAGE (décision de Stef) : les
 * échanges arrivent. Ce qui rend cela sans danger n'est pas un verrou, c'est le
 * journal tenu en base — chaque semaine reste relisible avec le groupe qui
 * valait cette semaine-là. Et le carnet suit l'inscription et le terrain, pas
 * le groupe : changer ne fait perdre aucune journée déjà écrite.
 */
export function StageGroupChoice({ placementId }: { readonly placementId: PlacementId }) {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);

  const groupes = useQuery({
    queryKey: ["supervision-groups", activeProgram.id],
    queryFn: () => data.placements.listSupervisionGroups(activeProgram.id),
  });

  const semaines = useQuery({
    queryKey: ["supervision-group-weeks", activeProgram.id],
    queryFn: () => data.placements.listSupervisionGroupWeeks(activeProgram.id),
  });

  const rejoindre = useMutation({
    mutationFn: (groupId: SupervisionGroupId) => data.placements.joinSupervisionGroup(groupId),
    onSuccess: () => {
      toast.success("Groupe enregistré.");
      setOuvert(false);
      void queryClient.invalidateQueries({ queryKey: ["supervision-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["stage-logs-mine"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Groupe non enregistré."),
  });

  if (groupes.isPending) return <Skeleton className="h-24 w-full" />;
  if (!activeEnrollment) return null;

  /* Les groupes de MON terrain et de MA promotion : les seuls que je puisse
     rejoindre, et la fonction serveur refuse les autres de toute façon. */
  const candidats = (groupes.data ?? []).filter(
    (g) => g.placementId === placementId && g.cohortId === activeEnrollment.cohortId,
  );
  const mien = candidats.find((g) =>
    (g.memberEnrollmentIds as readonly string[]).includes(activeEnrollment.id),
  );

  /*
   * ON AFFICHE DES QU'IL EXISTE UN GROUPE, meme s'il n'y en a qu'un (correction
   * du 10/09, apres test de Stef). Cacher le bloc quand il n'y a rien a choisir
   * paraissait sobre ; a l'usage, l'etudiant ne voyait plus DU TOUT a quel
   * groupe il appartenait, et ne pouvait pas verifier ce que l'administration
   * avait pose. C'est le bouton « Changer » qui disparait quand il n'y a qu'un
   * groupe, pas l'information.
   */
  if (candidats.length === 0) return null;
  const choixPossible = candidats.length > 1;

  const compte = (groupId: string) => {
    const siennes = (semaines.data ?? []).filter((w) => w.groupId === groupId);
    const enService = siennes.filter((w) => w.kind === "on").length;
    return siennes.length === 0
      ? "calendrier non renseigné"
      : `${enService} semaine(s) en service sur ${siennes.length}`;
  };

  return (
    <section className="bg-card rounded-xl border p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="text-muted-foreground size-4" aria-hidden />
        <p className="text-[15px]">
          {mien ? (
            <>
              Vous êtes dans le groupe <strong>{mien.label}</strong>.
            </>
          ) : (
            <strong>Vous n'avez pas encore indiqué votre groupe.</strong>
          )}
        </p>
        {choixPossible || !mien ? (
          <Button
            size="sm"
            variant={mien ? "ghost" : "default"}
            className="ms-auto"
            onClick={() => setOuvert(!ouvert)}
          >
            {ouvert ? "Fermer" : mien ? "Changer" : "Choisir mon groupe"}
          </Button>
        ) : (
          <span className="text-muted-foreground ms-auto text-[12.5px]">
            seul groupe de ce terrain
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-[12.5px] leading-relaxed">
        Votre groupe détermine les semaines où l'on vous attend dans le service.
        {choixPossible
          ? " Vous pouvez en changer en cours de stage : vos journées déjà écrites sont conservées, et les semaines passées restent lues avec le groupe qui était le vôtre à ce moment-là."
          : " Ce terrain n'a qu'un groupe pour votre promotion : il n'y a rien à choisir."}
      </p>

      {ouvert ? (
        <ul className="mt-3 space-y-2">
          {candidats.map((groupe) => (
            <li key={groupe.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm">
                <span className="font-medium">{groupe.label}</span>{" "}
                <span className="text-muted-foreground">— {compte(groupe.id)}</span>
              </span>
              {groupe.id === mien?.id ? (
                <span className="text-muted-foreground ms-auto text-[12.5px]">votre groupe</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="ms-auto"
                  disabled={rejoindre.isPending}
                  onClick={() => rejoindre.mutate(groupe.id)}
                >
                  Je suis dans ce groupe
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
