/**
 * LE DOSSIER PROGRESSIF — les deux règles de calcul, hors de l'écran.
 *
 * Elles tiennent en dix lignes, mais elles décident du score qu'un étudiant
 * verra : elles méritent d'être lisibles et testées ailleurs que dans un
 * composant de 300 lignes.
 */

/** Ce qu'une étape jouée laisse derrière elle : son identité et son score EDN. */
export interface EtapeJouee {
  readonly etapeId: string;
  readonly score: number;
}

/**
 * LE SCORE DU DOSSIER EST LA MOYENNE DES ÉTAPES, et pas leur somme.
 *
 * Un dossier de trois étapes et un de dix se comparent alors directement, ce
 * qui est le seul usage qu'on en fait : « où j'en suis » et « où en est la
 * promotion ». Une somme aurait fait croire qu'un dossier long vaut mieux
 * qu'un dossier court.
 *
 * Un dossier sans étape jouée vaut ZÉRO, jamais NaN : une division par zéro
 * affichée à l'étudiant ressemble à une panne.
 */
export function scoreDuDossier(jouees: readonly EtapeJouee[]): number {
  if (jouees.length === 0) return 0;
  const somme = jouees.reduce((total, etape) => total + etape.score, 0);
  return somme / jouees.length;
}

/** Reste-t-il une étape après celle-ci ? Décide du libellé du bouton. */
export function etapeSuivante(index: number, total: number): boolean {
  return index + 1 < total;
}

/**
 * L'AVANCEMENT, en pourcentage d'étapes franchies. Il se compte sur les étapes
 * TERMINÉES : tant qu'on répond à la première, la barre est à zéro — on n'a
 * encore rien fini.
 */
export function avancement(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((index / total) * 100)));
}
