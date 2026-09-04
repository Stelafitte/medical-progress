import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { STAGE_LABELS_FR } from "@/domain/acquisitionPlan";
import { PlanOutcomeRow } from "@/features/passport/PlanOutcomeRow";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

interface BarreJalon {
  readonly cle: string;
  readonly label: string;
  readonly startsOn: string;
  readonly dueOn: string;
  readonly officielle: boolean;
  readonly items: readonly AcquisitionPlanItem[];
}

/**
 * Gantt REGROUPÉ PAR JALON (03/09).
 *
 * CE QUI N'ALLAIT PAS. Une barre par acquis, soit 368 barres empilées sur douze
 * semaines — et comme un jalon porte jusqu'à douze acquis, douze barres
 * strictement superposées, aux mêmes dates. Stef : « les listes sont
 * monstrueuses pour Kanban et Gantt ». C'est le même défaut que celui corrigé
 * le matin sur le Calendrier, à un écran près.
 *
 * POURQUOI LE JALON, ET NON LE CHAPITRE. Une barre de Gantt EST une période.
 * Le jalon en a une — sa semaine ; le chapitre n'en a pas, il s'étalerait du
 * premier au dernier de ses acquis et ne dirait rien. Le Kanban, lui, regroupe
 * par chapitre : il parle de contenu, pas de temps.
 *
 * LES NON PLANIFIÉS NE SONT PAS DESSINÉS, mais ils sont comptés sous le
 * diagramme et listés dans l'alternative textuelle. Un Gantt ne peut montrer
 * que ce qui a des dates ; les faire disparaître laisserait croire que tout le
 * programme est planifié.
 */
export function GanttView({
  items,
  range,
}: {
  items: readonly AcquisitionPlanItem[];
  range: { start: string; end: string };
}) {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const span = Math.max(end - start, 1);
  const pct = (iso: string) => ((new Date(iso).getTime() - start) / span) * 100;

  const parJalon = new Map<string, BarreJalon & { items: AcquisitionPlanItem[] }>();
  for (const item of items) {
    if (!item.startsOn || !item.dueOn || !item.milestoneLabel) continue;
    const cle = `${item.milestoneLabel}|${item.dueOn}`;
    const barre = parJalon.get(cle) ?? {
      cle,
      label: item.milestoneLabel,
      startsOn: item.startsOn,
      dueOn: item.dueOn,
      officielle: item.officialDeadline,
      items: [],
    };
    barre.items.push(item);
    parJalon.set(cle, barre);
  }
  const jalons = [...parJalon.values()].sort(
    (a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label),
  );
  const nonPlanifies = items.filter((item) => !item.startsOn || !item.dueOn);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun élément à afficher.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
        <div className="min-w-[42rem] space-y-3">
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(range.start)}</span>
            <span>{fmt(range.end)}</span>
          </p>
          <ul className="space-y-3">
            {jalons.map((jalon) => {
              const left = Math.max(pct(jalon.startsOn), 0);
              const width = Math.max(pct(jalon.dueOn) - left, 2);
              return (
                <li key={jalon.cle} className="grid grid-cols-[14rem_1fr] items-center gap-3">
                  <span className="truncate text-xs font-medium" title={jalon.label}>
                    {jalon.label}{" "}
                    <span className="text-muted-foreground">({jalon.items.length})</span>
                  </span>
                  <span className="relative block h-6 rounded bg-muted">
                    <span
                      className="absolute inset-y-0 rounded bg-primary/70"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      role="img"
                      aria-label={`${jalon.label} : du ${fmt(jalon.startsOn)} au ${fmt(jalon.dueOn)}, ${jalon.items.length} acquis`}
                    />
                    <span
                      aria-hidden
                      className="absolute top-0 h-6 w-0.5 bg-foreground"
                      style={{ left: `${Math.min(pct(jalon.dueOn), 99.5)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          {jalons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun acquis n'est encore posé sur un jalon du rétroplanning.
            </p>
          ) : null}
        </div>
      </div>

      {nonPlanifies.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {nonPlanifies.length} acquis ne sont portés par aucun jalon : ils n'ont pas d'échéance et
          n'apparaissent pas dans le diagramme.
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-2">
        <Accordion type="multiple" className="w-full">
          {jalons.map((jalon) => (
            <AccordionItem key={jalon.cle} value={jalon.cle}>
              <AccordionTrigger className="min-w-0 py-2 text-left text-sm">
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1 pr-2 sm:flex-row sm:items-center sm:gap-2">
                  <span className="w-full min-w-0 break-words font-medium sm:w-auto sm:flex-1 sm:truncate">
                    {jalon.label}
                  </span>
                  <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmt(jalon.startsOn)} → {fmt(jalon.dueOn)}
                    </span>
                    {jalon.officielle ? (
                      <Badge variant="outline" className="shrink-0 font-normal">
                        Officielle
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className="ms-auto shrink-0 font-normal">
                      {jalon.items.length}
                    </Badge>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="pt-1">
                  {jalon.items.map((item) => (
                    <PlanOutcomeRow
                      key={item.id}
                      item={item}
                      badges={
                        <span className="ml-2 text-xs text-muted-foreground">
                          {STAGE_LABELS_FR[item.stage]}
                        </span>
                      }
                    />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {nonPlanifies.length > 0 ? (
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="non-planifies">
              <AccordionTrigger className="min-w-0 py-2 text-left text-sm">
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                  <span>Sans jalon</span>
                  <Badge variant="outline" className="font-normal">
                    {nonPlanifies.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="pt-1">
                  {nonPlanifies.map((item) => (
                    <PlanOutcomeRow key={item.id} item={item} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>
    </div>
  );
}
