import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  competencesDuProgramme,
  learnerName,
  parTheme,
  supportsDeLAcquis,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { AcquisContenu } from "@/features/supervision/AcquisContenu";
import { ProgressionLegend, type EtatAcquis } from "@/features/supervision/ProgressionDot";
import {
  AcquisListe,
  PromotionHeatmap,
  moyenneCohorte,
} from "@/features/supervision/ProgressionMatrix";
import { useDataAccess } from "@/application/session";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import type { EnrollmentId, OutcomeId } from "@/domain/types";

/**
 * COMPETENCES A CONFIRMER — le geste central de l'encadrement (10/09),
 * remis en deux temps le 11/09.
 *
 * ⚠️ CE QUI EXISTAIT DEJA, ET QUE PERSONNE N'APPELAIT. `outcome_self_reports`
 * porte `validated_by` / `validated_at` depuis le 31/08, et les fonctions
 * `validate_outcome_declaration` et `revoke_outcome_validation` sont en base
 * depuis le même jour. Mesure le 10/09 : AUCUNE ligne de `src/` ne les
 * appelait.
 *
 * DEUX LECTURES, DEUX OBJETS — c'est l'arbitrage de Stef, et il tient à une
 * distinction simple : la LISTE répond à « qu'est-ce qu'on demande aux
 * étudiants », la MATRICE répond à « qui décroche ». Fondre les deux dans un
 * tableau par chapitre, comme je l'avais fait d'abord, ne répondait bien ni à
 * l'une ni à l'autre.
 *
 *   1. La liste, groupée par thème, avec pour chaque compétence L'AVANCEMENT
 *      MOYEN de la cohorte et le nombre de déclarants.
 *   2. La matrice de promotion, appelée par un bouton : une ligne par étudiant,
 *      les soixante-quatre compétences sur cette ligne.
 *
 * ⚠️ LA MATRICE NE SE MONTE QU'A LA DEMANDE. Vingt étudiants sur soixante-quatre
 * compétences font mille deux cent quatre-vingts cases cliquables ; les rendre
 * d'office à chaque visite ferait payer à tout le monde un écran que l'on
 * n'ouvre pas à chaque fois. Le bouton est aussi ce qui a été demandé.
 *
 * ⚠️ LE CONTENU SE DEPLIE SOUS CHAQUE COMPETENCE — ajouté le 11/09 après que
 * Stef l'a redemandé. L'encadrant doit pouvoir lire ce que l'étudiant reçoit :
 * les supports rattachés à la compétence (vidéos, chapitres) et, quand il
 * existe, le passage de cours propre à l'acquis. Les MEMES composants que
 * l'écran apprenant — une relecture sur une version « presque pareille » ne
 * prouverait rien.
 *
 * LES CONNAISSANCES SONT HORS CHAMP, et ce n'est pas cet écran qui le décide :
 * `validate_outcome_declaration` lève « Une connaissance ne se valide pas ».
 * Leur suivi vit dans l'onglet « Connaissances ».
 */
export function SupervisionCompetences() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { data: scope, isPending } = useSupervision();
  const [matriceOuverte, setMatriceOuverte] = useState(false);
  const matriceRef = useRef<HTMLDivElement | null>(null);

  const confirmer = useMutation({
    mutationFn: (input: { enrollmentId: EnrollmentId; outcomeId: OutcomeId; retirer: boolean }) =>
      input.retirer
        ? data.passport.revokeOutcomeValidation({
            enrollmentId: input.enrollmentId,
            outcomeId: input.outcomeId,
          })
        : data.passport.validateOutcomeDeclaration({
            enrollmentId: input.enrollmentId,
            outcomeId: input.outcomeId,
          }),
    onSuccess: (_r, input) => {
      toast.success(input.retirer ? "Confirmation retirée." : "Compétence confirmée.");
      void queryClient.invalidateQueries({ queryKey: ["supervision"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Enregistrement impossible."),
  });

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  const competences = competencesDuProgramme(scope);
  const chapitres = parTheme(scope, competences);

  const etudiants = scope.enrollments
    .map((e) => ({ enrollmentId: e.id as string, nom: learnerName(scope, e.id) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const etat = (enrollmentId: string, outcomeId: string): EtatAcquis => {
    const declaration = (scope.declarations.get(enrollmentId) ?? []).find(
      (d) => (d.outcomeId as string) === outcomeId,
    );
    if (!declaration) return { confirme: false };
    return { niveau: declaration.declaredLevel, confirme: declaration.validatedAt !== undefined };
  };

  const groupes = chapitres.map((c) => ({
    id: c.id,
    label: c.label,
    acquis: c.acquis.map((o) => ({ id: o.id as string, code: o.code, label: o.label })),
  }));

  let aConfirmer = 0;
  let confirmees = 0;
  for (const e of etudiants) {
    for (const o of competences) {
      const courant = etat(e.enrollmentId, o.id as string);
      if (courant.niveau === undefined) continue;
      if (courant.confirme) confirmees += 1;
      else aConfirmer += 1;
    }
  }

  const ouvrirLaMatrice = () => {
    setMatriceOuverte(true);
    /* Le défilement attend la peinture : la matrice n'existe pas encore au
       moment du clic, et `scrollIntoView` sur un élément absent ne fait rien. */
    window.requestAnimationFrame(() =>
      matriceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Compétences à confirmer"
        level={1}
        description="Ce que l'étudiant déclare avoir acquis, et que vous seul pouvez confirmer."
      />

      <ScopeNotice>
        Aucune acquisition n'est confirmée sans votre geste. La liste ci-dessous donne l'avancement
        moyen de la promotion sur chaque compétence ; la matrice, en bas de page, donne le détail
        étudiant par étudiant — c'est là qu'on confirme, en cliquant une case.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Étudiants suivis" value={etudiants.length} />
        <StatCard label="Compétences au programme" value={competences.length} />
        <StatCard label="Déclarations à confirmer" value={aConfirmer} />
        <StatCard label="Déjà confirmées" value={confirmees} />
      </div>

      <PanelCard
        title="Lecture des pastilles"
        description="La couleur dit le niveau déclaré ; l'anneau et la coche disent votre confirmation."
        action={
          <Button size="sm" variant="outline" onClick={ouvrirLaMatrice}>
            <LayoutGrid className="size-4" aria-hidden /> Suivi de promotion
          </Button>
        }
      >
        <ProgressionLegend />
        <p className="text-muted-foreground text-xs">
          Dans la liste, la pastille de gauche est le niveau MOYEN de la promotion et le compte à
          côté dit combien d'étudiants ont déclaré quelque chose sur cette compétence.
        </p>
      </PanelCard>

      {chapitres.length === 0 ? (
        <PanelCard title="Aucune compétence" description="Ce programme n'en définit pas encore.">
          <p className="text-muted-foreground text-sm">
            Les compétences se déclarent dans le Concepteur du programme.
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
                    {chapitre.acquis.length} compétence
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
                  suffixe={(id) => {
                    const trouve = chapitre.acquis.find((o) => (o.id as string) === id);
                    return trouve ? `· ${NATURE_LABELS_FR[trouve.nature]}` : undefined;
                  }}
                  contenu={(id) => (
                    <AcquisContenu
                      outcomeId={id as OutcomeId}
                      supports={supportsDeLAcquis(scope, id)}
                      /*
                       * PAS DE « passage propre à l'acquis » POUR UNE COMPETENCE.
                       * Le découpage 2026 rattache le texte aux CONNAISSANCES ;
                       * sur une compétence, `read_outcome_sections` retombe
                       * toujours sur le chapitre entier et le panneau affiche sa
                       * phrase de repli — « Ce point est traité dans le texte
                       * intégral du chapitre » — juste au-dessus de ce même
                       * chapitre, servi par le support. Dire deux fois la même
                       * chose fait douter de la première.
                       */
                      avecTexteDeLAcquis={false}
                    />
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div ref={matriceRef}>
        <PanelCard
          title="Suivi de promotion"
          description="Une ligne par étudiant, toutes les compétences. Survolez une case pour son intitulé, cliquez-la pour confirmer."
          action={
            matriceOuverte ? (
              <Button size="sm" variant="ghost" onClick={() => setMatriceOuverte(false)}>
                Masquer
              </Button>
            ) : null
          }
        >
          {matriceOuverte ? (
            <PromotionHeatmap
              groupes={groupes}
              etudiants={etudiants}
              etat={etat}
              enCours={confirmer.isPending}
              onCase={(enrollmentId, outcomeId, courant) =>
                confirmer.mutate({
                  enrollmentId: enrollmentId as EnrollmentId,
                  outcomeId: outcomeId as OutcomeId,
                  retirer: courant.confirme,
                })
              }
            />
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
