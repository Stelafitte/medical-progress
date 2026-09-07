/**
 * Mes statistiques — chiffres personnels de l'apprenant, extraits du passeport.
 * Aucun calcul comparatif avec les autres apprenants : le périmètre reste
 * strictement individuel.
 */
import { FieldHeader } from "@/components/field-header";
import { OutcomeMap } from "@/components/outcome-map";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useSession } from "@/application/session";
import { NATURE_LABELS_FR, summarizeProgress } from "@/domain/mastery";
import type { OutcomeNature } from "@/domain/types";

const NATURES: readonly OutcomeNature[] = ["knowledge", "simulated_competence", "real_competence"];

export function LearnerStatisticsView() {
  const { activeProgram, activeEnrollment } = useSession();
  const { data, isPending } = useLearnerPassport();

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const { progress, evidence, summary, plan } = data;
  const validated = evidence.filter((e) => e.status === "validated").length;
  /*
   * « JALONS RESTANTS : 367 » ETAIT FAUX (releve par Stef le 07/09). Le chiffre
   * comptait les ACQUIS non atteints, pas les jalons. Le programme en porte 29,
   * pas 367 — un facteur douze sur une tuile que l'etudiant lit en premier.
   * On compte desormais les deux, chacun sous son vrai nom : les jalons sont des
   * libelles distincts du retroplanning, les acquis sont des lignes.
   */
  const acquisRestants = plan.items.filter((item) => item.stage !== "acquired").length;
  const jalonsRestants = new Set(
    plan.items
      .filter((item) => item.stage !== "acquired" && item.milestoneLabel !== null)
      .map((item) => item.milestoneLabel),
  ).size;

  /*
   * LA CARTE remplace les tuiles de pourcentage : les acquis atteints en encre,
   * le reste eteint. Elle est pleine des la premiere semaine.
   */
  const cases = progress.map((p) => (p.meetsTarget ? "var(--foreground)" : "var(--dot-idle)"));

  return (
    <div className="space-y-8">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Ma progression"
        figures={[
          { value: summary.atTarget, label: "au niveau cible" },
          { value: acquisRestants, label: "acquis restants" },
          { value: jalonsRestants, label: "jalons restants" },
        ]}
      />

      <ScopeNotice>
        Ces chiffres décrivent uniquement votre parcours. Aucun classement ni comparaison avec les
        autres apprenants n'est produit.
      </ScopeNotice>

      <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="flex items-baseline gap-2.5">
          <b
            className="font-display text-[40px] font-medium leading-none tracking-[-0.03em]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {summary.atTarget}
          </b>
          <span className="text-sm text-muted-foreground">
            acquis au niveau cible sur {summary.total}
          </span>
        </p>
        <div className="my-3.5">
          <OutcomeMap
            cases={cases}
            label={`${summary.total} acquis du programme, ${summary.atTarget} au niveau cible`}
            legende={[
              { color: "var(--foreground)", label: "au niveau cible" },
              { color: "var(--dot-idle)", label: "à travailler" },
            ]}
          />
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Chaque carré est un acquis. {validated} preuve(s) validée(s) par un encadrant.
        </p>
      </section>

      <PanelCard title="Progression par nature d'acquis">
        {progress.length === 0 ? (
          <EmptyState>Aucun acquis configuré dans ce programme.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {NATURES.map((nature) => {
              const items = progress.filter((p) => p.outcome.nature === nature);
              const natureSummary = summarizeProgress(items);
              return (
                <li key={nature} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{NATURE_LABELS_FR[nature]}</span>
                    <span className="text-sm text-muted-foreground">
                      {natureSummary.atTarget} / {natureSummary.total} ·{" "}
                      {natureSummary.percentAtTarget} %
                    </span>
                  </div>
                  <Progress value={natureSummary.percentAtTarget} />
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
