import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { landingRouteFor, navSpacesFor } from "@/components/layout/navigation";
import { useSession } from "@/application/session";

/**
 * Page « Accès restreint ». Aucun contenu réservé n'est rendu :
 * le composant protégé n'est pas monté du tout.
 */
export function AccessRestricted({ area }: { area: string }) {
  const { rolesForAccess, activeProgram } = useSession();
  const navigate = useNavigate();
  /*
   * ⚠️ LA SORTIE DE SECOURS RENVOYAIT VERS « /espace » — LE TABLEAU DE BORD
   * APPRENANT. Pour un encadrant ou un administrateur, cette page est elle-même
   * réservée : le bouton menait donc à un second « Accès restreint ». On renvoie
   * vers la première page réellement accessible avec le rôle actif.
   */
  const retour = landingRouteFor(
    navSpacesFor(rolesForAccess, activeProgram.id, activeProgram.config, activeProgram.code),
  );
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <span className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <CardTitle className="text-xl">Accès restreint</CardTitle>
        <CardDescription>
          {area} est réservé aux rôles habilités dans le programme sélectionné. Votre rôle actuel ne
          permet pas d'y accéder.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button onClick={() => void navigate({ to: retour })}>Retour à mon espace</Button>
        <Button asChild variant="outline">
          <Link to="/espace/profil">Voir mon profil</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
