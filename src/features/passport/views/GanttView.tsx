import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EYEBROW, MilestoneHeading, TABULAIRE } from "@/components/milestone-heading";
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
  couleurDe,
}: {
  items: readonly AcquisitionPlanItem[];
  range: { start: string; end: string };
  /** Fourni par le Passeport, pour que les quatre vues colorent a l'identique. */
  couleurDe: (themeId: string | undefined) => string;
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
  /*
   * LA BARRE PREND LA COULEUR DU DOMAINE DOMINANT du jalon, comme la tuile de
   * la carte de synthese et celle du Kanban. Elle etait en `bg-primary/70` :
   * vingt-neuf barres d'un seul bleu, ou la couleur ne disait rien.
   */
  const couleurDuJalon = (portes: readonly AcquisitionPlanItem[]) => {
    const comptes = new Map<string, number>();
    for (const item of portes) {
      if (item.themeId === undefined) continue;
      comptes.set(item.themeId, (comptes.get(item.themeId) ?? 0) + 1);
    }
    return couleurDe([...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
  };
  const jalons = [...parJalon.values()]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label))
    .map((jalon) => ({
      ...jalon,
      couleur: couleurDuJalon(jalon.items),
      acquis: jalon.items.filter((item) => item.stage === "acquired").length,
      aValider: jalon.items.filter((item) => item.stage === "to_validate").length,
    }));
  const nonPlanifies = items.filter((item) => !item.startsOn || !item.dueOn);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun élément à afficher.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)] p-4">
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
                      className="absolute inset-y-0 rounded"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: jalon.couleur,
                      }}
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

      <div className="rounded-xl border bg-card shadow-[var(--shadow-card)] p-2">
        <Accordion type="multiple" className="w-full">
          {jalons.map((jalon) => (
            <AccordionItem key={jalon.cle} value={jalon.cle}>
              <AccordionTrigger className="min-w-0 gap-3 py-2 hover:no-underline">
                <MilestoneHeading
                  count={jalon.items.length}
                  color={jalon.couleur}
                  label={jalon.label}
                  done={jalon.acquis}
                  pending={jalon.aValider}
                  total={jalon.items.length}
                  trailing={
                    <span
                      className={`${EYEBROW} shrink-0 self-center text-muted-foreground`}
                      style={TABULAIRE}
                    >
                      {fmt(jalon.dueOn)}
                      {jalon.officielle ? " · officielle" : ""}
                    </span>
                  }
                />
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
              <AccordionTrigger className="min-w-0 gap-3 py-2 hover:no-underline">
                <MilestoneHeading
                  count={nonPlanifies.length}
                  color={couleurDe(undefined)}
                  label="Sans jalon"
                />
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
