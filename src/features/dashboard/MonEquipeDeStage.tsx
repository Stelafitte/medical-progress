/**
 * MON STAGE, MON GROUPE, CEUX QUI M'ENCADRENT — la carte de l'etudiant (12/09).
 *
 * LA DEMANDE. Stef, le 12/09 : « dans stage il faut afficher son stage
 * d'appartenance, son groupe et l'equipe d'encadrement et le responsable de
 * stage ». Jusqu'ici l'etudiant cochait ses journees sans savoir ou il etait
 * rattache ni a qui s'adresser.
 *
 * TOUT EST LU, RIEN N'EST DEDUIT. Le terrain vient de `placements`, le groupe
 * de `supervision_groups` (celui dont il est membre), les encadrants de
 * `supervision_group_supervisors`, le responsable du role `placement_manager`
 * pose sur ce terrain. Les NOMS n'etaient pas lisibles par un etudiant avant
 * la migration `20260912090000`, qui n'ouvre que ceux-la : les personnes de
 * SON terrain et de SON groupe, personne d'autre.
 *
 * ⚠️ AUCUN FILTRE DE PERIMETRE ICI. Si la base rend un nom, on l'affiche ; si
 * elle n'en rend pas, on dit « non renseigne » plutot que d'inventer. Un
 * filtre d'ecran donnerait l'illusion d'une regle qui vit en base.
 *
 * SANS GROUPE, PAS D'EQUIPE : c'est le groupe qui relie un etudiant a ses
 * encadrants. On le dit en clair -- c'est exactement le trou que le
 * concepteur signale en etape 4, vu de l'autre cote.
 */
import { useQuery } from "@tanstack/react-query";

import { useDataAccess, useSession } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";

const EYEBROW = "text-[11.5px] font-semibold uppercase tracking-[0.14em]";

export function MonEquipeDeStage() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();

  const { data: equipe, isPending } = useQuery({
    queryKey: ["mon-equipe-de-stage", activeProgram.id, activeEnrollment?.id ?? "none"],
    enabled: Boolean(activeEnrollment),
    queryFn: async () => {
      if (!activeEnrollment) return null;
      const [placements, groups, roles, people] = await Promise.all([
        data.placements.listPlacements(activeProgram.id),
        data.placements.listSupervisionGroups(activeProgram.id),
        data.administration.listAllRoleAssignments(),
        data.administration.listPeople(),
      ]);
      const groupe = groups.find((g) =>
        g.memberEnrollmentIds.some((id) => (id as string) === (activeEnrollment.id as string)),
      );
      if (!groupe)
        return { groupe: undefined, terrain: undefined, encadrants: [], responsables: [] };
      const terrain = placements.find((p) => (p.id as string) === (groupe.placementId as string));
      const nom = (personId: string) =>
        people.find((p) => (p.id as string) === personId)?.fullName ?? "non renseigné";
      const encadrants = groupe.supervisorPersonIds.map((id) => nom(id as string));
      const responsables = roles
        .filter(
          (r) =>
            r.role === "placement_manager" &&
            r.scope.kind === "placement" &&
            (r.scope.placementId as string) === (groupe.placementId as string),
        )
        .map((r) => nom(r.personId as string));
      return { groupe, terrain, encadrants, responsables };
    },
  });

  if (!activeEnrollment) return null;
  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (!equipe) return null;

  return (
    <article className="mt-3 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className="flex min-h-[3.25rem] items-center bg-field px-4 py-3 text-field-ink">
        <p className={EYEBROW}>Mon stage</p>
      </div>
      <div className="px-4 pb-4 pt-3.5">
        {!equipe.groupe ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Vous n'êtes rattaché à aucun groupe d'encadrement pour l'instant : votre responsable de
            stage vous y placera, et vos encadrants apparaîtront ici.
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Terrain
              </dt>
              <dd className="mt-0.5 font-medium">
                {equipe.terrain ? equipe.terrain.name : "non renseigné"}
                {equipe.terrain?.site ? (
                  <span className="block text-[12.5px] font-normal text-muted-foreground">
                    {equipe.terrain.site}
                    {equipe.terrain.department ? ` · ${equipe.terrain.department}` : ""}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Groupe
              </dt>
              <dd className="mt-0.5 font-medium">{equipe.groupe.label}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Responsable de stage
              </dt>
              <dd className="mt-0.5 font-medium">
                {equipe.responsables.length === 0
                  ? "non renseigné"
                  : equipe.responsables.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Encadrants
              </dt>
              <dd className="mt-0.5 font-medium">
                {equipe.encadrants.length === 0
                  ? "aucun encadrant rattaché à votre groupe pour l'instant"
                  : equipe.encadrants.join(", ")}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </article>
  );
}
