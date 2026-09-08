import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { NatureBadge } from "@/components/mastery-badge";
import { EYEBROW, MilestoneHeading, TABULAIRE } from "@/components/milestone-heading";
import { PLAN_STAGES, STAGE_LABELS_FR, type AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { HORS_CHAPITRE_KEY, groupByTheme } from "@/domain/outcomeGrouping";
import { PlanOutcomeRow } from "@/features/passport/PlanOutcomeRow";
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
  couleurDe,
  onProposeChange,
}: {
  items: readonly AcquisitionPlanItem[];
  themes: readonly OutcomeTheme[];
  /** Fourni par le Passeport, pour que les quatre vues colorent a l'identique. */
  couleurDe: (themeId: string | undefined) => string;
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
            className="min-w-0 rounded-xl border bg-card shadow-[var(--shadow-card)] p-3"
          >
            <h3
              id={headingId}
              className="mb-3 flex items-baseline justify-between gap-2 font-display text-[15px] font-medium tracking-[-0.01em]"
            >
              {STAGE_LABELS_FR[stage]}
              <span className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                {columnItems.length}
              </span>
            </h3>
            {columnItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun élément.</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {chapitres.map((chapitre) => (
                  <AccordionItem key={chapitre.key} value={chapitre.key}>
                    <AccordionTrigger className="min-w-0 gap-3 py-2 hover:no-underline">
                      <MilestoneHeading
                        count={chapitre.items.length}
                        color={couleurDe(
                          chapitre.key === HORS_CHAPITRE_KEY ? undefined : chapitre.key,
                        )}
                        label={chapitre.label}
                        done={chapitre.items.filter((item) => item.stage === "acquired").length}
                        pending={
                          chapitre.items.filter((item) => item.stage === "to_validate").length
                        }
                        total={chapitre.items.length}
                      />
                    </AccordionTrigger>
                    <AccordionContent>
                      {/*
                        LA CARTE A LAISSE PLACE A LA LIGNE PARTAGEE (04/09).
                        Elle portait l'avancement et l'echeance mais AUCUN
                        contenu, et pas meme l'interrupteur de declaration :
                        depuis le Kanban, un acquis se regardait sans pouvoir
                        ni l'ouvrir ni le declarer. Rien n'est perdu — tout ce
                        que portait la carte est passe SOUS l'intitule, avec le
                        cours ou la video.
                      */}
                      <ul className="pt-1">
                        {chapitre.items.map((item) => (
                          <PlanOutcomeRow
                            key={item.id}
                            item={item}
                            badges={
                              <span className="ml-2 inline-flex">
                                <NatureBadge nature={item.nature} />
                              </span>
                            }
                            extra={
                              <div className="space-y-2">
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
                              </div>
                            }
                          />
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
