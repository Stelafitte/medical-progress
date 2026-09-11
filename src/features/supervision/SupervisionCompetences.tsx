import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  competencesDuProgramme,
  learnerName,
  parTheme,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { ProgressionLegend, type EtatAcquis } from "@/features/supervision/ProgressionDot";
import { AcquisLegende, ProgressionMatrix } from "@/features/supervision/ProgressionMatrix";
import { useDataAccess } from "@/application/session";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import type { EnrollmentId, OutcomeId } from "@/domain/types";

/**
 * COMPETENCES A CONFIRMER — le geste central de l'encadrement (10/09),
 * remis en tableau le 11/09.
 *
 * ⚠️ CE QUI EXISTAIT DEJA, ET QUE PERSONNE N'APPELAIT. `outcome_self_reports`
 * porte `validated_by` / `validated_at` depuis le 31/08, et les fonctions
 * `validate_outcome_declaration` et `revoke_outcome_validation` sont en base
 * depuis le meme jour. Mesure le 10/09 : AUCUNE ligne de `src/` ne les
 * appelait.
 *
 * CE QUE LE 11/09 CHANGE, ET POURQUOI. L'ecran depliait un etudiant a la fois.
 * Pour repondre a « qui n'a rien declare sur ce geste ? » -- la question qu'on
 * se pose devant une promotion -- il fallait ouvrir chaque etudiant et relire
 * la meme liste. Desormais : un chapitre par accordeon, la liste en clair des
 * competences qu'il contient, et dessous la matrice etudiants x competences.
 * On confirme en cliquant la case.
 *
 * LES CHAPITRES SONT OUVERTS PAR DEFAUT (`defaultValue` = tous). Un accordeon
 * ferme economise de la place au prix d'un clic par chapitre avant de voir
 * quoi que ce soit : ici l'ecran sert justement a voir d'un coup d'oeil.
 *
 * LES CONNAISSANCES SONT HORS CHAMP, et ce n'est pas cet ecran qui le decide :
 * `validate_outcome_declaration` leve « Une connaissance ne se valide pas ».
 * On filtre donc ici pour ne pas proposer un geste qui echouerait -- la regle
 * reste en base. Leur suivi vit dans l'onglet « Connaissances ».
 *
 * TROIS ETATS, PAS DEUX : jamais declaree, declaree en attente, confirmee.
 * Fondre les deux premiers ferait passer un etudiant silencieux pour un
 * etudiant a jour.
 */
export function SupervisionCompetences() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { data: scope, isPending } = useSupervision();

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

  /** L'état d'une case : le niveau déclaré, et la confirmation si elle existe. */
  const etat = (enrollmentId: string, outcomeId: string): EtatAcquis => {
    const declaration = (scope.declarations.get(enrollmentId) ?? []).find(
      (d) => (d.outcomeId as string) === outcomeId,
    );
    if (!declaration) return { confirme: false };
    return { niveau: declaration.declaredLevel, confirme: declaration.validatedAt !== undefined };
  };

  /* Les deux chiffres de tête, comptés sur la même lecture que les cases --
     un compteur qui diverge de la grille qu'il surplombe est pire que pas de
     compteur du tout. */
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

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Compétences à confirmer"
        level={1}
        description="Ce que l'étudiant déclare avoir acquis, et que vous seul pouvez confirmer."
      />

      <ScopeNotice>
        Aucune acquisition n'est confirmée sans votre geste. Cliquez une case pour confirmer une
        déclaration, cliquez-la de nouveau pour retirer la confirmation. Une case vide signifie que
        l'étudiant n'a rien déclaré : il n'y a alors rien à confirmer.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Étudiants suivis" value={etudiants.length} />
        <StatCard label="Compétences au programme" value={competences.length} />
        <StatCard label="Déclarations à confirmer" value={aConfirmer} />
        <StatCard label="Déjà confirmées" value={confirmees} />
      </div>

      <PanelCard
        title="Lecture de la grille"
        description="La couleur dit le niveau déclaré par l'étudiant ; l'anneau et la coche disent votre confirmation."
      >
        <ProgressionLegend />
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
              <AccordionContent className="space-y-4 pb-4">
                <AcquisLegende
                  acquis={chapitre.acquis.map((o) => ({
                    id: o.id as string,
                    code: o.code,
                    label: o.label,
                  }))}
                  suffixe={(id) => {
                    const trouve = chapitre.acquis.find((o) => (o.id as string) === id);
                    return trouve ? `· ${NATURE_LABELS_FR[trouve.nature]}` : undefined;
                  }}
                />
                <ProgressionMatrix
                  acquis={chapitre.acquis.map((o) => ({
                    id: o.id as string,
                    code: o.code,
                    label: o.label,
                  }))}
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
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
