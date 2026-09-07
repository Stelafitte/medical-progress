import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { listResourceFigures } from "@/infrastructure/supabase/resourceFigures";

/** Les liens signes valent une heure ; on les renouvelle bien avant. */
const VALIDITE_MS = 60 * 60 * 1000;
const FRAICHEUR_MS = 45 * 60 * 1000;

/**
 * LA GALERIE DE FIGURES D'UN CHAPITRE.
 *
 * Elle s'affiche D'EMBLEE, contrairement au texte : une figure d'ECG ou de
 * coupe echographique se regarde sur un telephone, ce que 40 000 caracteres a
 * plat ne permettent pas.
 *
 * TROIS PRECAUTIONS CONTRE L'EXPIRATION DES LIENS (07/09). Une URL signee vaut
 * UNE HEURE. Sans rien faire, un etudiant qui laisse l'onglet ouvert pendant un
 * staff, ou qui le rouvre le lendemain, verrait des cadres vides sans jamais
 * comprendre pourquoi — et l'ecran n'aurait aucun moyen de le lui dire.
 *
 *   1. ON NE SIGNE QU'A L'ENTREE DANS LE CHAMP. Signer au rendu de la page
 *      brulerait l'heure de validite pendant que l'etudiant lit un autre
 *      chapitre, et signerait 62 liens pour un chapitre qu'il ne deroulera
 *      peut-etre jamais.
 *   2. ON RE-SIGNE QUAND UNE IMAGE ECHOUE. `onError` est le seul signal fiable :
 *      il ne dit pas « lien expire », il dit « ce fichier n'est pas arrive »,
 *      ce qui couvre l'expiration comme la coupure reseau. Une seule
 *      re-signature par salve, sinon un fichier reellement absent boucle.
 *   3. UN ECHEC PERSISTANT SE VOIT. Un trou dans une grille se lit comme un
 *      bogue de rendu ; une case qui dit « image indisponible » se lit comme
 *      une information.
 */
export function ResourceFigures({
  resourceIds,
  titre = "Figures du chapitre",
}: {
  readonly resourceIds: readonly string[];
  readonly titre?: string;
}) {
  const ancre = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [echecs, setEchecs] = useState<ReadonlySet<string>>(new Set());
  const resignatureFaite = useRef(false);

  /*
   * L'observateur se debranche des la premiere apparition : une fois la galerie
   * vue, la garder sous surveillance ne sert plus a rien.
   */
  useEffect(() => {
    const cible = ancre.current;
    if (cible === null || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) setVisible(true);
      },
      // On signe un peu avant l'arrivee a l'ecran, pour que l'image soit prete.
      { rootMargin: "300px" },
    );
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [visible]);

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["resource-figures", [...resourceIds].sort().join(",")],
    queryFn: () => listResourceFigures(resourceIds),
    enabled: visible && resourceIds.length > 0,
    // Sous l'heure de validite : react-query resigne avant l'expiration.
    staleTime: FRAICHEUR_MS,
    gcTime: VALIDITE_MS,
    refetchOnWindowFocus: true,
  });

  /*
   * UNE SEULE RE-SIGNATURE PAR SALVE. Vingt images qui echouent ensemble — le
   * cas exact d'un lot de liens expires — ne doivent declencher qu'UN appel.
   */
  const surEchec = useCallback(
    (assetId: string) => {
      setEchecs((precedents) => new Set(precedents).add(assetId));
      if (resignatureFaite.current || isFetching) return;
      resignatureFaite.current = true;
      void refetch().then(() => {
        setEchecs(new Set());
        window.setTimeout(() => {
          resignatureFaite.current = false;
        }, 5000);
      });
    },
    [refetch, isFetching],
  );

  if (resourceIds.length === 0) return null;

  return (
    <section ref={ancre}>
      {!visible || isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">Figures momentanément illisibles.</p>
      ) : !data || data.length === 0 ? null : (
        <>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {titre} · {data.length}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.map((figure) => (
              <li key={figure.assetId} className="overflow-hidden rounded-lg border bg-card">
                {echecs.has(figure.assetId) ? (
                  <p className="flex min-h-32 flex-col items-center justify-center gap-2 bg-card-sunk px-3 text-center text-[12.5px] text-muted-foreground">
                    <ImageOff className="size-5" aria-hidden />
                    Image indisponible pour l'instant.
                  </p>
                ) : (
                  <img
                    src={figure.url}
                    alt={figure.legende ?? `Figure ${figure.num}`}
                    loading="lazy"
                    decoding="async"
                    onError={() => surEchec(figure.assetId)}
                    className="block w-full bg-card-sunk object-contain"
                  />
                )}
                <p className="px-3 py-2 text-[12.5px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">Fig. {figure.num}</span>
                  {figure.legende ? ` — ${figure.legende}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
