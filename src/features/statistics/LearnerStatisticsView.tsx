/**
 * Mes statistiques — chiffres personnels de l'apprenant, extraits du passeport.
 * Aucun calcul comparatif avec les autres apprenants : le périmètre reste
 * strictement individuel.
 */
import { FieldHeader } from "@/components/field-header";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { OutcomeMap } from "@/components/outcome-map";
import { Skeleton } from "@/components/ui/skeleton";
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
  /* Declares, en attente de l'encadrant : ni acquis, ni « a faire ». */
  const enAttente = plan.items.filter((item) => item.stage === "to_validate").length;

  /*
   * LA CARTE remplace les tuiles de pourcentage : les acquis atteints en encre,
   * le reste eteint. Elle est pleine des la premiere semaine.
   */
  const cases = progress.map((p) => (p.meetsTarget ? "var(--success)" : "var(--dot-idle)"));

  return (
    <div className="space-y-7">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Ma progression"
        figures={[
          { value: summary.atTarget, label: "au niveau cible" },
          { value: acquisRestants, label: "acquis restants" },
          { value: jalonsRestants, label: "jalons restants" },
        ]}
      />

      <section className="-mt-[38px] overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="px-4 pb-3.5 pt-4">
          <p className="flex items-baseline gap-2.5">
            <b
              className="font-display text-[40px] font-medium leading-none tracking-[-0.03em]"
              style={TABULAIRE}
            >
              {summary.atTarget}
            </b>
            <span className="text-sm text-muted-foreground">
              acquis au niveau cible sur {summary.total}
              {enAttente > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">{enAttente} déclarés</span>
                </>
              ) : null}
            </span>
          </p>
          <div className="my-3.5">
            <OutcomeMap
              cases={cases}
              label={`${summary.total} acquis du programme, ${summary.atTarget} au niveau cible`}
              legende={[
                { color: "var(--success)", label: "au niveau cible" },
                { color: "var(--dot-idle)", label: "à travailler" },
              ]}
            />
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Chaque carré est un acquis. {validated} preuve
            {validated > 1 ? "s" : ""} validée{validated > 1 ? "s" : ""} par un encadrant.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
          Par nature d'acquis
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          {progress.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Aucun acquis configuré dans ce programme.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {NATURES.map((nature) => {
                const items = progress.filter((p) => p.outcome.nature === nature);
                const natureSummary = summarizeProgress(items);
                /*
                 * LA MEME PISTE DE 3 PX QUE PARTOUT AILLEURS, plutot que le
                 * composant `Progress` : celui-ci dessine une barre haute et
                 * arrondie, d'un bleu unique, qui ne ressemble a aucun autre
                 * avancement de l'application. La connaissance n'etant pas un
                 * domaine, la piste reste en marine.
                 */
                return (
                  <li key={nature} className="px-4 py-3.5">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {NATURE_LABELS_FR[nature]}
                      </span>
                      <span className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                        {natureSummary.atTarget} / {natureSummary.total} ·{" "}
                        {natureSummary.percentAtTarget} %
                      </span>
                    </p>
                    <span
                      className="mt-2 flex h-[3px] overflow-hidden rounded-sm bg-card-sunk"
                      aria-hidden
                    >
                      <span
                        className="block h-full bg-field"
                        style={{
                          width: `${Math.max(
                            natureSummary.percentAtTarget,
                            natureSummary.atTarget > 0 ? 3 : 0,
                          )}%`,
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {/*
            LE PERIMETRE REDEVIENT UNE NOTE DE PIED, dans la carte qu'il
            qualifie, plutot qu'un bandeau encadre en tete d'ecran.
          */}
          <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Ces chiffres décrivent uniquement votre parcours. Aucun classement ni comparaison avec
            les autres apprenants n'est produit.
          </p>
        </div>
      </section>
    </div>
  );
}
