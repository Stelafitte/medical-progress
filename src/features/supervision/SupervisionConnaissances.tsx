import { useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  supportsDeLAcquis,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { AcquisContenu } from "@/features/supervision/AcquisContenu";
import { ProgressionLegend, type EtatAcquis } from "@/features/supervision/ProgressionDot";
import { AcquisListe, moyenneCohorte } from "@/features/supervision/ProgressionMatrix";
import { PromotionHeatmap } from "@/features/supervision/PromotionHeatmap";
import { RankBadge } from "@/components/rank-badge";
import type { OutcomeId } from "@/domain/types";

/**
 * CONNAISSANCES — l'onglet demandé par Stef le 11/09, dans la même forme que
 * les compétences.
 *
 * TROIS BESOINS, ET ILS NE SONT PAS DU MEME ORDRE :
 *
 * 1. SAVOIR CE QUE PORTE LE PROGRAMME. La liste, groupée par item, avec pour
 *    chaque connaissance l'avancement moyen de la promotion.
 * 2. VERIFIER LA SOURCE. Chaque connaissance se déplie sur son contenu —
 *    le passage de cours ET les supports rattachés — rendu par `AcquisContenu`,
 *    qui réemploie les composants de l'écran étudiant. Une relecture sur une
 *    version « presque pareille » ne prouverait rien.
 * 3. VOIR QUI DECROCHE. La matrice de promotion, appelée par un bouton.
 *
 * ⚠️ ON NE CONFIRME PAS UNE CONNAISSANCE, et ce n'est pas un oubli : la base
 * refuse — `validate_outcome_declaration` lève « Une connaissance ne se valide
 * pas : la V1 ne teste pas les connaissances ». Les cases sont donc en LECTURE
 * SEULE, et la légende ne montre pas la coche de confirmation.
 *
 * ⚠️ TAILLE `xs` POUR LA MATRICE, ET C'EST LE NOMBRE QUI COMMANDE. Trois cent
 * trente et une connaissances par ligne : à la taille des compétences, la
 * grille ferait cinq mille pixels de large. Le motif — c'est lui qu'on
 * regarde — doit tenir dans un écran, ou du moins dans quelques défilements.
 *
 * LE CONTENU NE SE CHARGE QU'A L'OUVERTURE. Monter le texte des 331
 * connaissances lancerait autant de requêtes ; Radix démonte ce qui est fermé.
 *
 * ⚠️ UN SEUL CHAPITRE OUVERT A LA FOIS, ET AUCUN AU DEPART — corrigé le 11/09
 * APRES MESURE A L'ECRAN. Ouvrir les 23 chapitres par défaut rend 331 lignes
 * dans la même page : le navigateur fige (la capture d'écran a expiré au bout
 * de 30 secondes). Ce qui vaut pour une poignée de compétences ne vaut pas pour
 * trois cents connaissances — le nombre change la nature de l'écran.
 */
export function SupervisionConnaissances() {
  const { data: scope, isPending } = useSupervision();
  const [matriceOuverte, setMatriceOuverte] = useState(false);
  const matriceRef = useRef<HTMLDivElement | null>(null);

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

  const groupes = chapitres.map((c) => ({
    id: c.id,
    label: c.label,
    acquis: c.acquis.map((o) => ({ id: o.id as string, code: o.code, label: o.label })),
  }));

  let declarees = 0;
  for (const e of etudiants) {
    for (const o of connaissances) {
      if (etat(e.enrollmentId, o.id as string).niveau !== undefined) declarees += 1;
    }
  }

  const ouvrirLaMatrice = () => {
    setMatriceOuverte(true);
    window.requestAnimationFrame(() =>
      matriceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Connaissances"
        level={1}
        description="Le contenu servi aux étudiants, et où chacun en est."
      />

      <ScopeNotice>
        Vous lisez ici le texte exactement tel que l'étudiant le reçoit : c'est la source à
        vérifier. Les connaissances ne se confirment pas — la matrice est en lecture seule, elle dit
        ce que chacun déclare avoir travaillé.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Étudiants suivis" value={etudiants.length} />
        <StatCard label="Connaissances au programme" value={connaissances.length} />
        <StatCard label="Chapitres" value={chapitres.length} />
        <StatCard label="Déclarations enregistrées" value={declarees} />
      </div>

      <PanelCard
        title="Lecture des pastilles"
        description="La couleur dit le niveau que l'étudiant déclare avoir atteint."
        action={
          <Button size="sm" variant="outline" onClick={ouvrirLaMatrice}>
            <LayoutGrid className="size-4" aria-hidden /> Suivi de promotion
          </Button>
        }
      >
        <ProgressionLegend confirmation={false} />
        <p className="text-muted-foreground text-xs">
          Dans la liste, la pastille de gauche est le niveau MOYEN de la promotion et le compte à
          côté dit combien d'étudiants ont déclaré quelque chose. Les chapitres s'ouvrent un à la
          fois : ce programme en compte {chapitres.length} pour {connaissances.length}{" "}
          connaissances.
        </p>
      </PanelCard>

      {chapitres.length === 0 ? (
        <PanelCard title="Aucune connaissance" description="Ce programme n'en définit pas encore.">
          <p className="text-muted-foreground text-sm">
            Les connaissances se déclarent dans le Concepteur du programme.
          </p>
        </PanelCard>
      ) : (
        <Accordion type="single" collapsible className="space-y-3">
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

              <AccordionContent className="pb-4">
                <AcquisListe
                  acquis={chapitre.acquis.map((o) => ({
                    id: o.id as string,
                    code: o.code,
                    label: o.label,
                  }))}
                  moyenne={
                    etudiants.length > 0 ? (id) => moyenneCohorte(etudiants, id, etat) : undefined
                  }
                  badge={(id) => {
                    const trouve = chapitre.acquis.find((o) => (o.id as string) === id);
                    return trouve?.knowledgeRank ? <RankBadge rank={trouve.knowledgeRank} /> : null;
                  }}
                  contenu={(id) => {
                    const trouve = chapitre.acquis.find((o) => (o.id as string) === id);
                    return (
                      <div className="space-y-2">
                        {trouve?.description ? (
                          <p className="text-muted-foreground text-sm">{trouve.description}</p>
                        ) : null}
                        <AcquisContenu
                          outcomeId={id as OutcomeId}
                          supports={supportsDeLAcquis(scope, id)}
                        />
                      </div>
                    );
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div ref={matriceRef}>
        <PanelCard
          title="Suivi de promotion"
          description="Une ligne par étudiant, toutes les connaissances. Survolez une case pour son intitulé."
          action={
            matriceOuverte ? (
              <Button size="sm" variant="ghost" onClick={() => setMatriceOuverte(false)}>
                Masquer
              </Button>
            ) : null
          }
        >
          {matriceOuverte ? (
            <PromotionHeatmap groupes={groupes} etudiants={etudiants} etat={etat} taille="xs" />
          ) : (
            <Button variant="outline" onClick={ouvrirLaMatrice}>
              <LayoutGrid className="size-4" aria-hidden /> Afficher la matrice
            </Button>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
