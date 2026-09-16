/**
 * DÉCALER LE CALENDRIER, HORS PAUSE.
 *
 * Stef, 16/09 : le geste le plus demandé quand il y a un pépin — et le seul
 * qui était impossible sans interrompre la promotion. On ne veut pas geler les
 * rendus parce qu'une salle est prise : on veut décaler.
 *
 * DEUX PRÉCAUTIONS, TENUES PAR LA BASE ET RAPPELÉES ICI :
 *   - on ne décale QUE ce qui n'a pas encore eu lieu (la semaine de départ),
 *     parce que décaler un jalon déjà tenu réécrirait le passé ;
 *   - avancer le calendrier ne peut pas pousser un jalon avant le début de la
 *     promotion : la semaine 0 est le premier jour, il n'y a rien derrière.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess } from "@/application/session";
import { cleJournal } from "@/features/administration/cohortInterruptionQuery";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { CohortId } from "@/domain/types";

export function CalendarShiftPanel({
  cohortId,
  finActuelle,
  semainesEcoulees,
  onChanged,
}: {
  readonly cohortId: CohortId;
  readonly finActuelle: string;
  /** La semaine où en est la promotion : tout ce qui suit est encore déplaçable. */
  readonly semainesEcoulees: number;
  readonly onChanged?: () => void;
}) {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const [semaines, setSemaines] = useState("1");
  const [depuis, setDepuis] = useState(String(Math.max(0, semainesEcoulees)));
  const [motif, setMotif] = useState("");
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const decaler = useMutation({
    mutationFn: () =>
      dataAccess.programs.shiftCohortCalendar({
        cohortId,
        weeks: Number.parseInt(semaines, 10) || 0,
        reason: motif.trim(),
        fromWeek: Number.parseInt(depuis, 10) || 0,
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: cleJournal(cohortId) });
      onChanged?.();
      setResultat(
        `${r.jalonsDecales} jalon(s) déplacé(s). La promotion finit désormais le ${formatFrDate(r.nouvelleFin)}.`,
      );
      setMotif("");
      setErreur(null);
    },
    onError: (raison: unknown) => {
      setResultat(null);
      setErreur(raison instanceof Error ? raison.message : "Décalage impossible.");
    },
  });

  const n = Number.parseInt(semaines, 10) || 0;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        Déplace la fin de la promotion et les jalons à partir d'une semaine donnée. Un nombre
        positif repousse, un nombre négatif avance. Fin actuelle : {formatFrDate(finActuelle)}.
      </p>

      {erreur ? (
        <p className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-[13px]">
          {erreur}
        </p>
      ) : null}
      {resultat ? (
        <p className="bg-card-sunk rounded-lg px-3 py-2 text-[13px]">{resultat}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="decalage-semaines">Décaler de (semaines)</Label>
          <Input
            id="decalage-semaines"
            type="number"
            min={-104}
            max={104}
            value={semaines}
            onChange={(e) => setSemaines(e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="decalage-depuis">À partir de la semaine</Label>
          <Input
            id="decalage-depuis"
            type="number"
            min={0}
            max={104}
            value={depuis}
            onChange={(e) => setDepuis(e.target.value)}
            className="min-h-11"
          />
          <p className="text-muted-foreground text-[12px]">
            La promotion en est à la semaine {Math.max(0, semainesEcoulees)}. Ce qui précède a été
            tenu : le décaler réécrirait le passé.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="decalage-motif">Motif (obligatoire)</Label>
        <Textarea
          id="decalage-motif"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={2}
          placeholder="Salle de simulation indisponible jusqu'à la mi-novembre."
        />
      </div>

      <Button
        type="button"
        className="min-h-11"
        disabled={n === 0 || motif.trim().length < 3 || decaler.isPending}
        onClick={() => decaler.mutate()}
      >
        {decaler.isPending ? (
          <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
        ) : (
          <CalendarClock className="me-1 size-4" aria-hidden />
        )}
        {n > 0 ? `Repousser de ${n} semaine(s)` : n < 0 ? `Avancer de ${-n} semaine(s)` : "Décaler"}
      </Button>
    </div>
  );
}
