/**
 * LE BANDEAU D'INTERRUPTION — ce que l'apprenant et l'encadrant voient quand
 * la promotion est en pause.
 *
 * POURQUOI IL EST DANS LA COQUE ET PAS DANS UN ÉCRAN. Une promotion suspendue
 * ou gelée l'est pour TOUT le parcours : la vue d'ensemble, le carnet, les
 * évaluations, les ressources. Un bandeau posé sur un seul onglet laisserait
 * l'étudiant découvrir le blocage au moment où il essaie de rendre — c'est-à-
 * dire au pire moment.
 *
 * `flagged` n'affiche RIEN : c'est tout son objet, le parcours continue et
 * l'interruption n'est qu'une trace pour l'équipe.
 *
 * Le personnel du programme voit le bandeau lui aussi, mais rédigé pour lui :
 * il continue d'écrire (la garde de base l'exempte), il doit simplement savoir
 * dans quel état est la promotion qu'il regarde.
 */
import { useQuery } from "@tanstack/react-query";
import { Pause } from "lucide-react";
import { useDataAccess, useSession } from "@/application/session";
import { cleInterruptions } from "@/features/administration/cohortInterruptionQuery";
import {
  INTERRUPTION_LEARNER_NOTICE_FR,
  INTERRUPTION_STATE_LABELS_FR,
  interruptionEnCours,
} from "@/domain/cohortInterruption";
import type { CohortId } from "@/domain/types";

function dateFr(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function CohortInterruptionBanner() {
  const session = useSession();
  const dataAccess = useDataAccess();
  const cohortId = session.activeEnrollment?.cohortId;

  const interruptions = useQuery({
    queryKey: cleInterruptions(cohortId ?? "aucune"),
    enabled: Boolean(cohortId),
    queryFn: () => dataAccess.programs.listCohortInterruptions(cohortId as CohortId),
  });

  const enCours = interruptionEnCours(interruptions.data ?? []);
  if (!enCours || enCours.mode === "flagged") return null;

  const estPersonnel = session.canAccessProgramAdministration || session.canAccessSupervision;
  const titre = estPersonnel
    ? `Promotion en pause — ${INTERRUPTION_STATE_LABELS_FR[enCours.mode]}`
    : INTERRUPTION_LEARNER_NOTICE_FR[enCours.mode];

  return (
    <div
      role="status"
      className="bg-live/12 border-live/40 -mx-4 -mt-8 mb-7 flex items-start gap-3 border-b px-4 py-4 sm:-mx-6 sm:px-6"
    >
      <Pause className="text-live-ink mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{titre}</p>
        <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">
          {enCours.reason}
          {enCours.expectedUntil ? ` · reprise prévue le ${dateFr(enCours.expectedUntil)}` : null}
        </p>
      </div>
    </div>
  );
}
