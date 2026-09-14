/**
 * LE CHAMP DE RECHERCHE DE L'EN-TÊTE.
 *
 * Chercher est un geste TRANSVERSE, pas un lieu : le champ doit donc être
 * atteignable depuis les neuf onglets, sans en devenir un dixième. Il vit dans
 * l'en-tête collant et ouvre `/espace/recherche?q=…`, qui est une vraie route —
 * six blocs d'extraits ne tiennent pas dans un menu déroulant en 390 px, et une
 * URL se recharge, se partage et revient par le bouton Précédent.
 *
 * SUR TÉLÉPHONE, UNE LOUPE SEULE. La ligne d'en-tête porte déjà le menu, le
 * sélecteur de programme et le profil : un champ complet en 390 px les
 * écraserait. La loupe ouvre l'écran, qui porte alors son propre champ.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/application/session";
import { canSearchProgram } from "@/domain/access";

export function HeaderSearch() {
  const { rolesForAccess, activeProgram } = useSession();
  const navigate = useNavigate();
  /*
   * LA REQUÊTE COURANTE EST LUE DANS L'URL, pas conservée dans un état global :
   * l'URL est la source de vérité de cet écran. Sans cette lecture, revenir sur
   * la page par le bouton Précédent afficherait des résultats dans un champ
   * vide.
   */
  const requeteCourante = useRouterState({
    select: (etat) => {
      const valeur = (etat.location.search as Record<string, unknown>)["q"];
      return typeof valeur === "string" ? valeur : "";
    },
  });
  const [saisie, setSaisie] = useState(requeteCourante);

  /*
   * VISIBLE POUR TOUS LES PROFILS DU PROGRAMME. Le champ disparaît seulement
   * pour quelqu'un qui n'a AUCUN rôle dans le programme affiché — là, il n'y
   * aurait rien à chercher.
   */
  if (!canSearchProgram(rolesForAccess, activeProgram.id)) return null;

  function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = saisie.trim();
    if (q.length === 0) return;
    void navigate({ to: "/espace/recherche", search: { q } });
  }

  return (
    <>
      <Button asChild variant="ghost" size="icon" className="shrink-0 md:hidden">
        <Link to="/espace/recherche" aria-label="Rechercher">
          <Search className="size-5" aria-hidden />
        </Link>
      </Button>

      <form onSubmit={soumettre} role="search" className="hidden md:block">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={saisie}
            onChange={(event) => setSaisie(event.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher dans tout le programme"
            className="h-9 w-44 ps-8 lg:w-64"
          />
        </div>
      </form>
    </>
  );
}
