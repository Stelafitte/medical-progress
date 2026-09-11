import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  connaissancesDuProgramme,
  learnerName,
  parTheme,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { ProgressionLegend, type EtatAcquis } from "@/features/supervision/ProgressionDot";
import { ProgressionMatrix } from "@/features/supervision/ProgressionMatrix";
import { OutcomeSectionsPanel } from "@/features/resources/OutcomeSectionsPanel";
import { RankBadge } from "@/components/rank-badge";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { OutcomeId } from "@/domain/types";

/**
 * CONNAISSANCES — l'onglet demandé par Stef le 11/09.
 *
 * DEUX BESOINS DANS UN SEUL ECRAN, et ils ne sont pas du même ordre :
 *
 * 1. VERIFIER LA SOURCE. L'encadrant doit pouvoir lire le contenu EXACTEMENT
 *    tel qu'il est servi à l'étudiant, pour dire si le texte est juste. C'est
 *    pourquoi le passage affiché vient du MEME composant que l'écran étudiant
 *    (`OutcomeSectionsPanel`) et non d'une mise en page refaite ici : une
 *    relecture sur une version « presque pareille » ne prouve rien.
 *
 * 2. SUIVRE LA PROMOTION. La même grille que les compétences, aux mêmes
 *    couleurs, pour voir d'un coup d'œil où en est chacun.
 *
 * ⚠️ ON NE CONFIRME PAS UNE CONNAISSANCE, et ce n'est pas un oubli : la base
 * elle-même refuse — `validate_outcome_declaration` lève « Une connaissance ne
 * se valide pas : la V1 ne teste pas les connaissances ». Les cases sont donc
 * en LECTURE SEULE, et la légende ne montre pas la coche de confirmation.
 * Afficher des cases cliquables qui échoueraient serait promettre un geste qui
 * n'existe pas.
 *
 * LE CONTENU NE SE CHARGE QU'A L'OUVERTURE. Une promotion porte des centaines
 * de connaissances ; monter le texte des trois cent trente d'un coup lancerait
 * autant de requêtes. L'accordéon de Radix démonte ce qui est fermé : le texte
 * n'est demandé que pour la connaissance qu'on déplie.
 */
export function SupervisionConnaissances() {
  const { data: scope, isPending } = useSupervision();

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  const connaissances = connaissancesDuProgramme(scope);
  const chapitres = parTheme(scope, connaissances);

  const etudiants = scope.enrollments
    .map((e) => ({ enrollmentId: e.id as string, nom: learnerName(scope, e.id) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const etat = (enrollmentId: string, outcomeId: string): EtatAcquis => {
    const declaration = (scope.declarations.get(enrollmentId) ?? []).find(
      (d) => (d.outcomeId as string) === outcomeId,
    );
    if (!declaration) return { confirme: false };
    return { niveau: declaration.declaredLevel, confirme: false };
  };

  /* Combien de déclarations en tout : le seul chiffre honnête ici, puisqu'il
     n'y a pas de confirmation à compter. */
  let declarees = 0;
  for (const e of etudiants) {
    for (const o of connaissances) {
      if (etat(e.enrollmentId, o.id as string).niveau !== undefined) declarees += 1;
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Connaissances"
        level={1}
        description="Le contenu servi aux étudiants, et où chacun en est."
      />

      <ScopeNotice>
        Vous lisez ici le texte exactement tel que l'étudiant le reçoit : c'est la source à
        vérifier. Les connaissances ne se confirment pas — la grille est en lecture seule, elle dit
        ce que chacun déclare avoir travaillé.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Étudiants suivis" value={etudiants.length} />
        <StatCard label="Connaissances au programme" value={connaissances.length} />
        <StatCard label="Chapitres" value={chapitres.length} />
        <StatCard label="Déclarations enregistrées" value={declarees} />
      </div>

      <PanelCard
        title="Lecture de la grille"
        description="La couleur dit le niveau que l'étudiant déclare avoir atteint."
      >
        <ProgressionLegend confirmation={false} />
      </PanelCard>

      {chapitres.length === 0 ? (
        <PanelCard title="Aucune connaissance" description="Ce programme n'en définit pas encore.">
          <p className="text-muted-foreground text-sm">
            Les connaissances se déclarent dans le Concepteur du programme.
          </p>
        </PanelCard>
      ) : (
        <Accordion type="multiple" defaultValue={chapitres.map((c) => c.id)} className="space-y-3">
          {chapitres.map((chapitre) => (
            <AccordionItem
              key={chapitre.id}
              value={chapitre.id}
              className="surface-panel rounded-lg border px-4"
            >
              <AccordionTrigger className="text-start">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{chapitre.label}</span>
                  <Badge variant="outline" className="font-normal">
                    {chapitre.acquis.length} connaissance
                    {chapitre.acquis.length > 1 ? "s" : ""}
                  </Badge>
                </span>
              </AccordionTrigger>

              <AccordionContent className="space-y-5 pb-4">
                <section className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Le contenu servi aux étudiants
                  </h3>
                  <Accordion type="multiple" className="divide-border divide-y">
                    {chapitre.acquis.map((o) => (
                      <AccordionItem key={o.id} value={o.id as string} className="border-0">
                        <AccordionTrigger className="py-2 text-start text-sm hover:no-underline">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-muted-foreground font-mono text-[12px]">
                              {o.code}
                            </span>
                            <span className="min-w-0">{o.label}</span>
                            {o.knowledgeRank ? <RankBadge rank={o.knowledgeRank} /> : null}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-4">
                          {o.description ? (
                            <p className="text-muted-foreground text-sm">{o.description}</p>
                          ) : null}
                          <OutcomeSectionsPanel outcomeId={o.id as OutcomeId} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>

                <section className="space-y-2">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Suivi de la promotion
                  </h3>
                  <ProgressionMatrix
                    acquis={chapitre.acquis.map((o) => ({
                      id: o.id as string,
                      code: o.code,
                      label: o.label,
                    }))}
                    etudiants={etudiants}
                    etat={etat}
                  />
                  <p className="text-muted-foreground text-xs">
                    Niveaux possibles : {Object.values(MASTERY_LABELS_FR).join(", ").toLowerCase()}.
                  </p>
                </section>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
