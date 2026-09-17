import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { landingRouteFor, navSpacesFor } from "@/components/layout/navigation";
import { useSession } from "@/application/session";

/**
 * ON NE REFUSE PLUS, ON CONDUIT — quel que soit le profil (17/09).
 *
 * Le 16/09, `/espace` avait cessé d'opposer un mur : c'était la porte d'entrée,
 * celle du favori, et un administrateur n'y a par construction jamais droit.
 * Mais le mur subsistait sur les VINGT AUTRES routes réservées. Stef l'a revu
 * le 17/09 en ouvrant `/espace/administration/pilotage` avec son compte
 * apprenant, et sa remarque est juste : « elle ne devait plus apparaître quel
 * que soit le profil ». Une adresse à laquelle on n'a pas droit n'apprend rien
 * à personne ; ce qui sert, c'est d'arriver quelque part.
 *
 * DEUX PRÉCAUTIONS, ET ELLES COMPTENT.
 *
 * 1. LA COURSE AVEC L'ADAPTATION DU RÔLE. L'enveloppe (`app-shell`) change le
 *    rôle actif quand la page ouverte relève d'un AUTRE rôle réel de la
 *    personne. Ses effets s'exécutent APRÈS ceux de ses enfants : une
 *    redirection immédiate partirait avant l'adaptation et éjecterait quelqu'un
 *    d'une page à laquelle il a droit. D'où le délai : si le rôle bascule, ce
 *    composant est démonté et le minuteur meurt avec lui.
 *
 * 2. L'IMPASSE RESTE DITE. Si la page d'atterrissage EST la page refusée, il
 *    n'y a nulle part où conduire : on l'affiche franchement plutôt que de
 *    boucler.
 */
const DELAI_ADAPTATION_MS = 150;

export function AccessRestricted({ area }: { area: string }) {
  const { rolesForAccess, activeProgram } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const retour = landingRouteFor(
    navSpacesFor(rolesForAccess, activeProgram.id, activeProgram.config, activeProgram.code),
  );
  const impasse = retour === pathname;

  useEffect(() => {
    if (impasse) return;
    const minuteur = setTimeout(() => {
      /* `replace` : sinon « Précédent » ramènerait sur la page refusée. */
      void navigate({ to: retour, replace: true });
    }, DELAI_ADAPTATION_MS);
    return () => clearTimeout(minuteur);
  }, [impasse, navigate, retour]);

  if (!impasse) {
    return <p className="text-muted-foreground p-6 text-sm">Ouverture de votre espace…</p>;
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <span className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <CardTitle className="text-xl">Accès restreint</CardTitle>
        <CardDescription>
          {area} est réservé aux rôles habilités dans le programme sélectionné, et aucun autre écran
          n'est accessible avec votre rôle actuel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/espace/profil">Voir mon profil</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
