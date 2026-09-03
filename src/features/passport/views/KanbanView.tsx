import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NatureBadge } from "@/components/mastery-badge";
import { PLAN_STAGES, STAGE_LABELS_FR, type AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { groupByTheme } from "@/domain/outcomeGrouping";
import type { OutcomeTheme } from "@/domain/types";

/**
 * Kanban REPLIÉ PAR CHAPITRE dans chaque colonne (03/09).
 *
 * CE QUI N'ALLAIT PAS. Le programme porte 368 acquis, et tant qu'aucun n'est
 * déclaré, ils tombent tous dans la même colonne : une colonne de 368 cartes,
 * que personne ne parcourt. Stef : « les listes sont monstrueuses pour Kanban
 * et Gantt ».
 *
 * POURQUOI LE CHAPITRE ICI, ET LE JALON DANS LE GANTT. Le Kanban répond à
 * « où j'en suis », une question de CONTENU : l'unité de révision d'un étudiant
 * est le chapitre. Le Gantt répond à « quand », une question de TEMPS : son
 * unité est le jalon. Regrouper les deux de la même façon aurait fait deux fois
 * la même vue.
 *
 * TOUT EST REPLIÉ AU DÉPART, avec le compte par chapitre : on choisit d'ouvrir,
 * on ne subit pas.
 */
export function KanbanView({
  items,
  themes,
  onProposeChange,
}: {
  items: readonly AcquisitionPlanItem[];
  themes: readonly OutcomeTheme[];
  onProposeChange: (item: AcquisitionPlanItem) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {PLAN_STAGES.map((stage) => {
        const columnItems = items.filter((i) => i.stage === stage);
        const chapitres = groupByTheme(columnItems, themes, (item) => item.themeId);
        const headingId = `kanban-${stage}`;
        return (
          <section
            key={stage}
            aria-labelledby={headingId}
            className="rounded-lg border border-border bg-card p-3"
          >
            <h3 id={headingId} className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {STAGE_LABELS_FR[stage]}
              <Badge variant="secondary">{columnItems.length}</Badge>
            </h3>
            {columnItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun élément.</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {chapitres.map((chapitre) => (
                  <AccordionItem key={chapitre.key} value={chapitre.key}>
                    <AccordionTrigger className="py-2 text-left text-sm">
                      <span className="flex flex-1 items-center justify-between gap-2 pr-2">
                        <span className="min-w-0 truncate">{chapitre.label}</span>
                        <Badge variant="outline" className="font-normal">
                          {chapitre.items.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-3 pt-1">
                        {chapitre.items.map((item) => (
                          <li key={item.id}>
                            <Card>
                              <CardHeader className="gap-2 pb-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {item.code}
                                  </Badge>
                                  <NatureBadge nature={item.nature} />
                                </div>
                                <CardTitle className="text-sm leading-snug">{item.label}</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2 pb-4">
                                <Progress
                                  value={item.progressPercent}
                                  aria-label={`Avancement de ${item.code} : ${item.progressPercent} % du niveau cible`}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {item.dueOn
                                    ? `Échéance ${new Date(item.dueOn).toLocaleDateString("fr-FR")}`
                                    : "Non planifié"}
                                  {item.officialDeadline ? " · échéance officielle" : ""}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onProposeChange(item)}
                                >
                                  Proposer une modification
                                </Button>
                              </CardContent>
                            </Card>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </section>
        );
      })}
    </div>
  );
}
