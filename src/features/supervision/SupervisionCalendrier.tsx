import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { SupervisionWeeksSection } from "@/features/administration/SupervisionWeeksSection";
import { useSupervision } from "@/features/supervision/useSupervision";
import { useDataAccess, useSession } from "@/application/session";

/**
 * CALENDRIER DU STAGE, DANS L'ESPACE DE L'ENCADREMENT (11/09).
 *
 * POURQUOI CET ECRAN PLUTOT QUE D'OUVRIR « Gestion des stages ». Stef a
 * demande que le responsable de stage puisse poser lui-meme l'alternance --
 * c'est lui qui connait les dates reelles du service, les feries et les
 * semaines de congres. La migration `20260911090000` lui en a donne le droit en
 * base. Restait a le lui donner a l'ecran.
 *
 * L'ecran d'administration « Gestion des stages » porte QUATRE sections :
 * terrains, groupes, calendrier, modeles de carnet. Les trois autres ecrivent
 * par des fonctions reservees a `can_administer_program` : les ouvrir au
 * responsable lui aurait montre trois sections dont chaque bouton echoue. Et
 * cet ecran repose sur `useProgramAdmin`, qui charge la vingtaine de lectures
 * de l'administration -- une seule refusee par la RLS, et la page entiere
 * tombe. On monte donc ICI la meme section, avec les seules donnees dont elle a
 * besoin.
 *
 * ⚠️ LA MEME SECTION, PAS UNE COPIE. `SupervisionWeeksSection` est importee
 * telle quelle depuis l'administration. Deux calendriers a maintenir auraient
 * diverge au premier correctif, et c'est le genre de divergence qui ne se voit
 * qu'une fois le stage commence.
 *
 * L'ADMINISTRATEUR GARDE SON CHEMIN : la section reste ou elle etait dans
 * « Gestion des stages ». Rien n'est deplace, seulement rendu atteignable par
 * une seconde porte.
 */
export function SupervisionCalendrier() {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const { data: scope, isPending } = useSupervision();
  const [cohortId, setCohortId] = useState<string | null>(null);

  const { data: cohorts } = useQuery({
    queryKey: ["cohorts", activeProgram.id],
    queryFn: () => data.programs.listCohorts(activeProgram.id),
  });

  if (isPending || !scope || !cohorts) return <Skeleton className="h-72 w-full" />;

  /*
   * LES PROMOTIONS QU'ON ENCADRE, PAS TOUTES CELLES DU PROGRAMME. Le groupe de
   * supervision porte la promotion ; la liste se deduit donc des groupes du
   * perimetre, sans avoir a redemander a la base qui encadre quoi.
   */
  const promotionsEncadrees = cohorts.filter((c) =>
    scope.groups.some((g) => (g.cohortId as string) === (c.id as string)),
  );
  const choisie = cohortId ?? (promotionsEncadrees[0]?.id as string | undefined) ?? "";

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Calendrier du stage"
        level={1}
        description="Les semaines en service et les semaines de travail personnel, groupe par groupe."
      />

      <ScopeNotice>
        Ce calendrier est ce qui permet au carnet de distinguer une journée manquée d'une semaine où
        personne n'était attendu. Une semaine laissée « non renseignée » n'est pas une semaine de
        travail personnel : elle reste inconnue, et le carnet le dit plutôt que de conclure.
      </ScopeNotice>

      {promotionsEncadrees.length === 0 ? (
        <PanelCard
          title="Aucune promotion"
          description="Aucun groupe d'encadrement n'est rattaché à votre terrain."
        >
          <p className="text-muted-foreground text-sm">
            Le calendrier se pose groupe par groupe : il faut d'abord qu'un groupe existe sur votre
            terrain.
          </p>
        </PanelCard>
      ) : (
        <>
          {promotionsEncadrees.length > 1 ? (
            <PanelCard title="Promotion" description="Choisissez la promotion à calendrier.">
              <Select value={choisie} onValueChange={setCohortId}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Choisir une promotion" />
                </SelectTrigger>
                <SelectContent>
                  {promotionsEncadrees.map((c) => (
                    <SelectItem key={c.id} value={c.id as string}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PanelCard>
          ) : null}

          <SupervisionWeeksSection
            programId={activeProgram.id}
            cohorts={cohorts}
            cohortId={choisie}
            groups={scope.groups}
          />
        </>
      )}
    </div>
  );
}
