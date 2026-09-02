/**
 * Le rétroplanning enregistré, en barres, à la fin du bloc « Jalons ».
 *
 * DEUX CHOIX QUI EXPLIQUENT CE QU'ON VOIT.
 *
 * 1. **Il montre ce qui est ENREGISTRÉ, pas ce qui est en train d'être saisi.**
 *    Un graphique qui bougerait à chaque frappe se lirait comme un brouillon ;
 *    celui-ci est le contrôle d'après-coup : on enregistre, et on vérifie que
 *    la promotion a la forme qu'on croyait lui donner.
 * 2. **Aucune dépendance.** Le registre npm est fermé sur ce poste, et onze
 *    semaines de barres n'appellent pas une bibliothèque : une position en
 *    pourcentage suffit. La zone défile horizontalement sur téléphone, et
 *    chaque barre porte son intitulé en toutes lettres pour le lecteur
 *    d'écran, qui ne verra jamais une largeur.
 *
 * Ce n'est PAS `GanttView` du passeport : celui-là dessine des acquis datés un
 * par un (`AcquisitionPlanItem`), pas des jalons. Le réutiliser demanderait de
 * fabriquer de faux acquis à l'entrée — exactement le défaut corrigé le 01/09
 * sur les listes d'association, où trois écrans partageaient un composant en
 * lui construisant chacun ses lignes.
 */
import { Badge } from "@/components/ui/badge";
import { milestoneGantt, type PlanMilestone } from "@/domain/acquisitionPlan";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { IsoDateTime } from "@/domain/types";

export function ProgramMilestoneGantt({
  milestones,
  cohortStartsOn,
}: {
  milestones: readonly PlanMilestone[];
  cohortStartsOn: IsoDateTime;
}) {
  const { lastWeek, bars } = milestoneGantt(milestones, cohortStartsOn);

  /*
   * Rien d'enregistré : pas de cadre vide. Un graphique sans barre ressemble à
   * un graphique cassé, et la liste au-dessus dit déjà qu'il n'y a rien.
   */
  if (bars.length === 0) return null;

  const span = lastWeek + 1;
  const weeks = Array.from({ length: span }, (_, index) => index);

  return (
    <section className="space-y-2" aria-label="Rétroplanning enregistré">
      <h4 className="text-sm font-medium">Le rétroplanning enregistré, semaine par semaine</h4>
      <div className="border-border overflow-x-auto rounded-md border p-3">
        <div className="min-w-[36rem] space-y-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: "12rem 1fr" }}>
            <span />
            <div className="text-muted-foreground flex text-[10px]">
              {weeks.map((week) => (
                <span key={week} className="flex-1 text-center">
                  S{week}
                </span>
              ))}
            </div>
          </div>
          <ul className="space-y-1">
            {bars.map((bar) => {
              const left = (bar.weekStart / span) * 100;
              const width = ((bar.weekEnd - bar.weekStart + 1) / span) * 100;
              const when =
                bar.weekStart === bar.weekEnd
                  ? `semaine ${bar.weekStart}, le ${formatFrDate(bar.startsOn)}`
                  : `semaines ${bar.weekStart} à ${bar.weekEnd}, du ${formatFrDate(bar.startsOn)} au ${formatFrDate(bar.endsOn)}`;
              return (
                <li
                  key={bar.id}
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: "12rem 1fr" }}
                >
                  <span className="flex items-center gap-1 text-xs">
                    <span className="truncate" title={bar.label}>
                      {bar.label}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                      {bar.outcomeCount}
                    </Badge>
                  </span>
                  <span className="bg-muted relative block h-5 rounded">
                    <span
                      className={`absolute inset-y-0 rounded ${bar.official ? "bg-success" : "bg-primary/70"}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      role="img"
                      aria-label={`${bar.label} : ${when}, ${bar.outcomeCount} acquis${bar.official ? ", échéance officielle" : ""}.`}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Le chiffre suit le nombre d'acquis que le jalon emporte. L'échelle part de la semaine 0 — le
        début de la promotion — et s'arrête au dernier jalon posé : elle ne prétend pas dire où la
        promotion se termine, rien en base ne le lui dit encore.
      </p>
    </section>
  );
}
