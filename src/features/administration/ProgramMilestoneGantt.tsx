/**
 * Le rétroplanning en barres, à la fin du bloc « Jalons » — et manipulable.
 *
 * CE QU'IL EST, ET CE QU'IL A CESSÉ D'ÊTRE.
 *
 * Il a d'abord été un contrôle d'après-coup : il montrait les jalons
 * ENREGISTRÉS, pour vérifier après enregistrement que la promotion avait la
 * forme qu'on croyait lui donner. Stef a demandé le 02/09 de pouvoir déplacer
 * les barres — dès lors le graphique ne peut plus montrer la base, sinon la
 * barre qu'on vient de tirer reviendrait à sa place. Il est devenu la SECONDE
 * VUE de la même saisie que la liste au-dessus.
 *
 * Ce qui se perdait dans ce renversement — « voilà ce qui est vraiment en
 * base » — revient par `unsaved` : une barre modifiée et pas encore
 * enregistrée porte un contour. Sans ça, un rétroplanning déplacé et jamais
 * enregistré serait indiscernable d'un rétroplanning en base.
 *
 * LES DEUX GESTES.
 * - Tirer la barre : le jalon se déplace sans changer de durée.
 * - Tirer une extrémité : le jalon s'étale ou se resserre — c'est ce qui
 *   transforme un jalon ponctuel en période, et l'inverse.
 * Le calcul de ces deux gestes est dans le domaine (`dragMilestoneTiming`),
 * pas ici : il se teste, et un glissement qui déformerait une période contre
 * le bord du stage est un défaut qu'on ne verrait pas à l'oeil.
 *
 * Aucune dépendance : le registre npm est fermé sur ce poste, et onze semaines
 * de barres n'appellent pas une bibliothèque. La zone défile horizontalement,
 * et chaque barre porte son intitulé en toutes lettres pour le lecteur
 * d'écran, qui ne verra jamais une largeur — au clavier, le réglage se fait
 * dans les champs de la liste, qui restent la voie complète.
 *
 * Ce n'est PAS `GanttView` du passeport : celui-là dessine des acquis datés un
 * par un (`AcquisitionPlanItem`), pas des jalons.
 */
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  PLAN_MILESTONE_MAX_WEEK,
  dragMilestoneTiming,
  milestoneGanttBars,
  type MilestoneDragKind,
  type MilestoneGanttBar,
  type MilestoneTiming,
  type PlanMilestone,
} from "@/domain/acquisitionPlan";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { IsoDateTime } from "@/domain/types";

interface DragState {
  readonly themeId: string;
  readonly kind: MilestoneDragKind;
  readonly startX: number;
  readonly track: HTMLElement;
  readonly origin: MilestoneTiming;
}

export function ProgramMilestoneGantt({
  themes,
  timings,
  existing,
  outcomeCounts,
  cohortStartsOn,
  promotionLastWeek,
  onChange,
}: {
  /** Chapitres dans l'ordre de la liste : les barres suivent le même. */
  themes: readonly { readonly id: string; readonly label: string }[];
  timings: Readonly<Record<string, MilestoneTiming>>;
  existing: readonly PlanMilestone[];
  outcomeCounts: ReadonlyMap<string, number>;
  cohortStartsOn: IsoDateTime;
  /** Dernière semaine de la promotion. Au-delà, un jalon est hors stage. */
  promotionLastWeek?: number;
  onChange: (themeId: string, timing: MilestoneTiming) => void;
}) {
  const { lastWeek, bars } = milestoneGanttBars({
    themes,
    timings,
    existing,
    outcomeCounts,
    cohortStartsOn,
    ...(promotionLastWeek === undefined ? {} : { promotionLastWeek }),
  });

  const span = lastWeek + 1;
  /*
   * L'échelle peut changer pendant un glissement — ramener la seule barre qui
   * dépassait rétrécit l'échelle — donc la largeur d'une semaine se recalcule
   * à chaque mouvement, jamais au début du geste.
   */
  const spanRef = useRef(span);
  spanRef.current = span;
  const drag = useRef<DragState | null>(null);

  const unsavedCount = bars.filter((bar) => bar.unsaved).length;
  const dragBound = { lastWeek: promotionLastWeek ?? PLAN_MILESTONE_MAX_WEEK };

  function beginDrag(
    event: React.PointerEvent<HTMLElement>,
    bar: MilestoneGanttBar,
    kind: MilestoneDragKind,
  ) {
    const track = event.currentTarget.closest("[data-gantt-track]");
    if (!(track instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = {
      themeId: bar.themeId,
      kind,
      startX: event.clientX,
      track,
      origin: bar.timing,
    };
    /*
     * La capture APRÈS l'enregistrement du geste, et sans laisser une erreur
     * l'interrompre : elle n'est qu'un confort — elle permet de sortir de la
     * barre en tirant — alors qu'une exception ici empêcherait le glissement
     * de commencer. Mesuré le 02/09 : `setPointerCapture` refuse un pointeur
     * qu'il ne connaît pas, et le geste entier ne partait pas.
     */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sans capture, le glissement fonctionne tant que le pointeur reste sur
      // la barre : c'est dégradé, pas cassé.
    }
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (current === null) return;
    const weekPx = current.track.getBoundingClientRect().width / spanRef.current;
    if (weekPx <= 0) return;
    const deltaWeeks = Math.round((event.clientX - current.startX) / weekPx);
    onChange(
      current.themeId,
      dragMilestoneTiming(current.origin, { kind: current.kind, deltaWeeks }, dragBound),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (drag.current === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  /*
   * Rien de daté : pas de cadre vide. Un graphique sans barre ressemble à un
   * graphique cassé, et la liste au-dessus dit déjà qu'il n'y a rien.
   */
  if (bars.length === 0) return null;

  const weeks = Array.from({ length: span }, (_, index) => index);
  const handle = "absolute inset-y-0 w-3 cursor-ew-resize touch-none";

  return (
    <section className="space-y-2" aria-label="Rétroplanning de la promotion">
      <h4 className="text-sm font-medium">Le rétroplanning, semaine par semaine</h4>
      <div className="border-border overflow-x-auto rounded-md border p-3">
        <div className="min-w-[36rem] space-y-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: "12rem 1fr" }}>
            <span />
            <div className="text-muted-foreground flex text-[10px]">
              {weeks.map((week) => (
                <span
                  key={week}
                  className={
                    promotionLastWeek !== undefined && week > promotionLastWeek
                      ? "text-destructive flex-1 text-center"
                      : "flex-1 text-center"
                  }
                >
                  S{week}
                </span>
              ))}
            </div>
          </div>
          <ul className="space-y-1">
            {bars.map((bar) => {
              const left = (bar.weekStart / span) * 100;
              const width = ((bar.weekEnd - bar.weekStart + 1) / span) * 100;
              const outside = promotionLastWeek !== undefined && bar.weekEnd > promotionLastWeek;
              const when =
                bar.weekStart === bar.weekEnd
                  ? `semaine ${bar.weekStart}, le ${formatFrDate(bar.startsOn)}`
                  : `semaines ${bar.weekStart} à ${bar.weekEnd}, du ${formatFrDate(bar.startsOn)} au ${formatFrDate(bar.endsOn)}`;
              return (
                <li
                  key={bar.themeId}
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
                  <span data-gantt-track className="bg-muted relative block h-6 rounded">
                    {/*
                      La fin de la promotion, en trait plein. C'est ce qui rend
                      lisible d'un coup d'oeil qu'un jalon est posé après la fin
                      du stage : la barre passe le trait.
                    */}
                    {promotionLastWeek !== undefined && promotionLastWeek < lastWeek ? (
                      <span
                        aria-hidden
                        className="bg-destructive absolute inset-y-0 w-0.5"
                        style={{ left: `${((promotionLastWeek + 1) / span) * 100}%` }}
                      />
                    ) : null}
                    <span
                      className={`absolute inset-y-0 cursor-grab touch-none rounded active:cursor-grabbing ${
                        outside ? "bg-destructive/70" : "bg-primary/70"
                      } ${bar.unsaved ? "ring-foreground/70 ring-2" : ""}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      role="img"
                      aria-label={`${bar.label} : ${when}, ${bar.outcomeCount} acquis${
                        outside ? ", APRÈS la fin de la promotion" : ""
                      }${bar.unsaved ? ", non enregistré" : ""}.`}
                      onPointerDown={(event) => beginDrag(event, bar, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      <span
                        aria-hidden
                        className={`${handle} start-0`}
                        onPointerDown={(event) => beginDrag(event, bar, "start")}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                      <span
                        aria-hidden
                        className={`${handle} end-0`}
                        onPointerDown={(event) => beginDrag(event, bar, "end")}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Tirez une barre pour déplacer le jalon, ou l'une de ses extrémités pour l'étaler — au
        clavier, les champs de la liste font la même chose. Le chiffre suit le nombre d'acquis que
        le jalon emporte, et le trait rouge marque la fin de la promotion : une barre qui le dépasse
        est une échéance posée après le dernier jour du stage.
        {unsavedCount > 0
          ? ` ${unsavedCount} jalon(s) entouré(s) : modifiés, pas encore enregistrés.`
          : ""}
      </p>
    </section>
  );
}
