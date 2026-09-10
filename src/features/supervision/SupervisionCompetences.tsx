import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  competencesDuProgramme,
  learnerName,
  useSupervision,
} from "@/features/supervision/useSupervision";
import { useDataAccess } from "@/application/session";
import { MASTERY_LABELS_FR, NATURE_LABELS_FR } from "@/domain/mastery";
import type { EnrollmentId, OutcomeId } from "@/domain/types";

/**
 * COMPETENCES A CONFIRMER — le geste central de l'encadrement (10/09).
 *
 * ⚠️ CE QUI EXISTAIT DEJA, ET QUE PERSONNE N'APPELAIT. `outcome_self_reports`
 * porte `validated_by` / `validated_at` depuis le 31/08, et les fonctions
 * `validate_outcome_declaration` et `revoke_outcome_validation` sont en base
 * depuis le meme jour. Mesure le 10/09 : AUCUNE ligne de `src/` ne les
 * appelait. L'ecran affichait des confirmations de maquette pendant que le
 * geste reel attendait un bouton.
 *
 * LES CONNAISSANCES SONT HORS CHAMP, et ce n'est pas cet ecran qui le decide :
 * `validate_outcome_declaration` leve « Une connaissance ne se valide pas : la
 * V1 ne teste pas les connaissances ». On filtre donc ici pour ne pas proposer
 * un bouton qui echouerait -- la regle reste en base.
 *
 * TROIS ETATS, PAS DEUX : une competence peut n'avoir jamais ete declaree
 * (rien a confirmer), etre declaree et en attente, ou etre confirmee. Fondre
 * les deux premiers ferait passer un etudiant silencieux pour un etudiant a
 * jour.
 */
export function SupervisionCompetences() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { data: scope, isPending } = useSupervision();
  const [deplie, setDeplie] = useState<string | null>(null);

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

  /* Les acquis du programme qui SE CONFIRMENT : tout sauf les connaissances --
     `nature !== "knowledge"`, la meme regle que la base applique elle-meme. */
  const competences = competencesDuProgramme(scope);

  const lignes = scope.enrollments
    .map((enrollment) => {
      const declarees = scope.declarations.get(enrollment.id) ?? [];
      const parAcquis = new Map(declarees.map((d) => [d.outcomeId as string, d] as const));
      const aConfirmer = competences.filter((o) => {
        const d = parAcquis.get(o.id);
        return d !== undefined && d.validatedAt === undefined;
      });
      const confirmees = competences.filter((o) => parAcquis.get(o.id)?.validatedAt !== undefined);
      return {
        enrollment,
        nom: learnerName(scope, enrollment.id),
        parAcquis,
        aConfirmer,
        confirmees,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Compétences à confirmer"
        level={1}
        description="Ce que l'étudiant déclare avoir acquis, et que vous seul pouvez confirmer."
      />

      <ScopeNotice>
        Aucune acquisition n'est confirmée sans votre geste. Vous ne voyez que les étudiants de vos
        groupes d'encadrement.
      </ScopeNotice>

      <PanelCard
        title={`Les ${competences.length} compétences du stage`}
        description="Les connaissances théoriques ne figurent pas ici : elles ne se confirment pas au lit du malade, et la base refuse leur validation."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {competences.map((o) => (
            <li key={o.id} className="text-sm">
              <span className="font-mono text-[12px] text-muted-foreground">{o.code}</span>{" "}
              {o.label}{" "}
              <Badge variant="outline" className="font-normal">
                {NATURE_LABELS_FR[o.nature]}
              </Badge>
            </li>
          ))}
          {competences.length === 0 ? (
            <li className="text-muted-foreground text-sm">
              Aucune compétence définie dans ce programme.
            </li>
          ) : null}
        </ul>
      </PanelCard>

      <PanelCard
        title="Progression déclarée, étudiant par étudiant"
        description="Dépliez un étudiant pour confirmer ses déclarations une à une."
      >
        {lignes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun étudiant sur votre périmètre.</p>
        ) : (
          <ul className="divide-border divide-y">
            {lignes.map((ligne) => (
              <li key={ligne.enrollment.id} className="py-3 first:pt-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 text-start"
                  aria-expanded={deplie === ligne.enrollment.id}
                  onClick={() =>
                    setDeplie(deplie === ligne.enrollment.id ? null : ligne.enrollment.id)
                  }
                >
                  <span className="font-medium">{ligne.nom}</span>
                  <Badge variant={ligne.aConfirmer.length > 0 ? "default" : "secondary"}>
                    {ligne.aConfirmer.length} à confirmer
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {ligne.confirmees.length} / {competences.length} confirmées
                  </Badge>
                </button>

                {deplie === ligne.enrollment.id ? (
                  <ul className="mt-3 space-y-2">
                    {competences.map((o) => {
                      const d = ligne.parAcquis.get(o.id);
                      const confirmee = d?.validatedAt !== undefined;
                      return (
                        <li
                          key={o.id}
                          className="flex flex-wrap items-start justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="text-muted-foreground font-mono text-[12px]">
                              {o.code}
                            </span>{" "}
                            {o.label}
                            <span className="text-muted-foreground block text-[13px]">
                              {d
                                ? `déclaré ${MASTERY_LABELS_FR[d.declaredLevel].toLowerCase()} le ${new Date(
                                    d.declaredAt,
                                  ).toLocaleDateString("fr-FR")}`
                                : "aucune déclaration"}
                              {d?.note ? ` · ${d.note}` : ""}
                            </span>
                          </span>
                          {d ? (
                            <Button
                              size="sm"
                              variant={confirmee ? "ghost" : "outline"}
                              disabled={confirmer.isPending}
                              onClick={() =>
                                confirmer.mutate({
                                  enrollmentId: ligne.enrollment.id,
                                  outcomeId: o.id,
                                  retirer: confirmee,
                                })
                              }
                            >
                              {confirmee ? "Retirer la confirmation" : "Confirmer"}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
