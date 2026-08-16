import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Page « Accès restreint ». Aucun contenu réservé n'est rendu :
 * le composant protégé n'est pas monté du tout.
 */
export function AccessRestricted({ area }: { area: string }) {
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
        <Button asChild>
          <Link to="/espace">Retour au tableau de bord</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/espace/profil">Voir mon profil</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
