/**
 * QUI ENCADRE AVEC MOI — la carte d'équipe de l'encadrant (11/09).
 *
 * POURQUOI ELLE EXISTE. Stef, le 11/09 : « idéalement il faudrait que
 * l'encadrant voie dans sa vue d'ensemble et dans communication qui sont les
 * autres encadrants et le responsable du stage ». Jusqu'ici un encadrant
 * travaillait sans savoir à qui s'adresser : la base ne lui rendait que SES
 * propres rôles, et le profil d'un collègue — qui n'est pas un inscrit —
 * restait invisible. La migration `20260911200000` a ouvert les deux lectures
 * entre membres d'un même programme ; cette carte les montre.
 *
 * ⚠️ AUCUN FILTRE DE PERIMETRE N'EST ECRIT ICI. Ce que la carte affiche est
 * exactement ce que la RLS a bien voulu rendre. Filtrer une seconde fois à
 * l'écran donnerait l'illusion d'une règle qui vit en base, et masquerait le
 * jour où la base changerait d'avis.
 *
 * LE RESPONSABLE DE STAGE EN PREMIER, puis les encadrants, puis le reste : on
 * cherche d'abord qui décide, ensuite avec qui l'on partage la promotion.
 */
import { Badge } from "@/components/ui/badge";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { ROLE_LABELS_FR } from "@/domain/roles";
import type { RoleName } from "@/domain/types";
import { useSupervision, type SupervisionScope } from "@/features/supervision/useSupervision";
import { Skeleton } from "@/components/ui/skeleton";

/** L'ordre d'affichage. Ce qui n'est pas listé ici passe après, en l'état. */
const ORDRE: readonly RoleName[] = [
  "placement_manager",
  "placement_supervisor",
  "teacher",
  "administrator",
];

export function EquipeDuProgramme({
  scope,
  titre = "L'équipe de ce programme",
}: {
  scope: SupervisionScope;
  titre?: string;
}) {
  const nom = (personId: string) =>
    scope.staffProfiles.find((p) => (p.id as string) === personId)?.fullName;

  /* Une personne peut porter plusieurs rôles : on la montre une fois, avec
     tous ses rôles. Deux lignes pour la même personne feraient croire à deux
     personnes. */
  const parPersonne = new Map<string, Set<RoleName>>();
  for (const ra of scope.roleAssignments) {
    if (ra.role === "learner") continue;
    const id = ra.personId as string;
    const deja = parPersonne.get(id) ?? new Set<RoleName>();
    deja.add(ra.role);
    parPersonne.set(id, deja);
  }

  const membres = [...parPersonne.entries()]
    .map(([id, roles]) => ({ id, roles: [...roles], nom: nom(id) }))
    .filter((m) => m.nom !== undefined)
    .sort((a, b) => {
      const rang = (m: { roles: readonly RoleName[] }) =>
        Math.min(...m.roles.map((r) => (ORDRE.indexOf(r) === -1 ? 9 : ORDRE.indexOf(r))));
      return rang(a) - rang(b) || (a.nom ?? "").localeCompare(b.nom ?? "", "fr");
    });

  return (
    <PanelCard
      title={titre}
      description="Les personnes qui encadrent, enseignent ou administrent ce programme."
    >
      {membres.length === 0 ? (
        <EmptyState>Personne d'autre n'est visible sur votre périmètre pour l'instant.</EmptyState>
      ) : (
        <ul className="divide-border divide-y">
          {membres.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-medium">{m.nom}</span>
              {m.roles.map((r) => (
                <Badge key={r} variant="outline" className="font-normal">
                  {ROLE_LABELS_FR[r]}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/**
 * LA MEME CARTE, QUI VA CHERCHER SON PERIMETRE ELLE-MEME.
 *
 * La vue d'ensemble a deja le scope sous la main et le passe ; la
 * communication interne, elle, n'en a pas -- et l'y faire remonter obligerait
 * cet ecran a connaitre l'encadrement. Un composant, deux portes d'entree,
 * une seule mise en page.
 */
export function EquipeDuProgrammeAutonome({ titre }: { titre?: string }) {
  const { data, isPending } = useSupervision();
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;
  return <EquipeDuProgramme scope={data} {...(titre ? { titre } : {})} />;
}
