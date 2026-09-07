/**
 * LA CARTE DES ACQUIS — un carre par acquis du programme.
 *
 * Elle existe pour remplacer, partout, l'anneau presque vide et le « 0 % ».
 * A la premiere semaine un anneau affiche un trait invisible et un
 * pourcentage nul : il ne dit que l'echec. Cette grille est PLEINE des le
 * premier jour — elle montre l'echelle du parcours, et les quelques carres
 * allumes se lisent comme un debut, pas comme un manque.
 *
 * Elle relie aussi les sections entre elles : les carres colores sont
 * exactement les acquis listes au-dessus.
 *
 * ELLE N'INVENTE RIEN : le nombre de carres est le nombre reel d'acquis. Si
 * la base en rend 367, il y a 367 carres.
 */
export function OutcomeMap({
  cases,
  label,
  legende = [],
}: {
  /** Une couleur CSS par acquis, dans l'ordre d'affichage. */
  readonly cases: readonly string[];
  /** Description pour les lecteurs d'ecran — la grille n'est pas lisible autrement. */
  readonly label: string;
  readonly legende?: readonly { color: string; label: string }[];
}) {
  return (
    <>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(7px, 1fr))" }}
        role="img"
        aria-label={label}
      >
        {cases.map((couleur, i) => (
          <span
            key={i}
            className="block aspect-square rounded-[1.5px]"
            style={{ backgroundColor: couleur }}
          />
        ))}
      </div>
      {legende.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {legende.map((entree) => (
            <li key={entree.label} className="inline-flex items-center gap-1.5">
              <span
                className="block size-2 rounded-sm"
                style={{ backgroundColor: entree.color }}
                aria-hidden
              />
              {entree.label}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
