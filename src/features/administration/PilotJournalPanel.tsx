/**
 * LE JOURNAL DU PILOTAGE.
 *
 * Une action de pilotage sans motif ni trace n'est pas du pilotage, c'est du
 * bricolage : six semaines plus tard, personne ne sait qui a décalé le
 * calendrier de trois semaines, ni pourquoi. Toutes les fonctions de pilotage
 * écrivent ici — interruption, reprise, décalage, incident, clôture.
 *
 * Il se LIT et ne se corrige pas : c'est ce qui en fait une trace.
 */
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import { cleJournal } from "@/features/administration/cohortInterruptionQuery";
import { DECISION_KIND_LABELS_FR } from "@/domain/pilotDecision";
import type { CohortId } from "@/domain/types";

function horodatage(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function PilotJournalPanel({ cohortId }: { readonly cohortId: CohortId }) {
  const dataAccess = useDataAccess();
  const journal = useQuery({
    queryKey: cleJournal(cohortId),
    queryFn: () => dataAccess.programs.listPilotDecisions(cohortId),
  });

  if (journal.isPending) {
    return <p className="text-muted-foreground text-[13px]">Lecture du journal…</p>;
  }

  const lignes = journal.data ?? [];
  if (lignes.length === 0) {
    return <EmptyState>Aucune décision de pilotage sur cette promotion.</EmptyState>;
  }

  return (
    <ol className="space-y-3">
      {lignes.map((d) => (
        <li key={d.id} className="border-s-2 border-border ps-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {DECISION_KIND_LABELS_FR[d.kind]}
            </Badge>
            <span className="text-sm font-medium">{d.summary}</span>
          </div>
          <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">{d.reason}</p>
          <p
            className="text-muted-foreground mt-1 text-[12px]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {horodatage(d.decidedAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
