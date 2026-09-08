import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";

/**
 * LA PHOTO DE PROFIL — televersement, lecture signee, retrait.
 *
 * HORS DE `supabaseDataAccess.ts`, comme `aiCompanion.ts` et
 * `resourceFigures.ts` : ce fichier appartient a une autre ligne de travail.
 *
 * CE QUE LA BASE GARANTIT, ET QUE CE MODULE NE FAIT QUE RESPECTER
 * (migration 20260908090000, appliquee et verifiee le 08/09) :
 *
 * - Le seau `avatars` est PRIVE. Aucune URL publique n'existe : la lecture
 *   passe par une URL signee d'une heure, comme les figures du referentiel.
 * - La securite tient a LA CONVENTION DE CHEMIN : `<profile_id>/<fichier>`.
 *   Les policies de `storage.objects` lisent le PREMIER SEGMENT du chemin et
 *   le comparent a `auth.uid()`. Un chemin construit autrement est refuse par
 *   la base — pas par ce fichier. C'est pour cela que l'identifiant vient de
 *   `auth.getUser()` et jamais de la session applicative : la policy compare a
 *   `auth.uid()`, donc le chemin doit etre bati sur la meme valeur.
 * - Le plafond de 2 Mo et les trois types d'image sont poses EN BASE. Les
 *   controles ci-dessous ne les remplacent pas : ils rendent un message
 *   lisible la ou la base rendrait une erreur de stockage incomprehensible.
 *
 * `profiles.avatar_path` n'a AUCUNE policy propre : la colonne herite de
 * `profiles_select_scoped` et `profiles_update_self`. Chacun ecrit la sienne,
 * et la photo se lit exactement aussi loin que la fiche — donc un encadrant qui
 * peut deja lire la fiche d'un etudiant voit sa photo, et personne d'autre.
 */

const SEAU = "avatars";
const TAILLE_MAX = 2 * 1024 * 1024;
const TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
/** Une heure, comme les figures : assez pour une session, pas plus. */
const VALIDITE_SECONDES = 3600;

/**
 * UN SUFFIXE UNIQUE, SANS L API `randomUUID`.
 *
 * MON ERREUR DU 08/09, mesuree sur le telephone de Stef : cette API demande
 * Safari 15.4 ou plus recent, et son iPhone est en dessous. L ecran rendait
 * « ... is not a function » a la premiere photo. Le nom exact de l API n est
 * pas ecrit ici : le test de contrat lit le CONTENU des fichiers, et le citer
 * ferait echouer le fichier qui la corrige.
 *
 * LA LECON EST PLUS LARGE QUE LA LIGNE : toute la V1 est concue pour un
 * telephone. Une API web recente doit etre verifiee contre CE terrain-la, pas
 * contre le navigateur de developpement. Un test de contrat garde desormais la
 * regle (`mobileContract.test.ts`).
 *
 * `getRandomValues` est disponible partout depuis iOS 6 et couvre le besoin :
 * il ne s agit pas de produire un identifiant universel, seulement un nom qui
 * ne collisionne pas dans le dossier d une seule personne. L horodatage suffit
 * deja presque ; les huit octets ferment le cas de deux envois dans la meme
 * milliseconde.
 */
function suffixeUnique(): string {
  const octets = new Uint8Array(8);
  const source = globalThis.crypto;
  if (source !== undefined && typeof source.getRandomValues === "function") {
    source.getRandomValues(octets);
  } else {
    for (let i = 0; i < octets.length; i += 1) {
      octets[i] = Math.floor(Math.random() * 256);
    }
  }
  const hexa = Array.from(octets, (octet) => octet.toString(16).padStart(2, "0")).join("");
  return `${Date.now().toString(36)}-${hexa}`;
}

export type Avatar = {
  /** Chemin de l'objet, ou `null` si la personne n'a pas de photo. */
  readonly path: string | null;
  /** URL signee, ou `null` si pas de photo ou si la signature a echoue. */
  readonly url: string | null;
};

function client() {
  const c = getBrowserSupabaseClient();
  if (!c) throw new Error("Session Supabase indisponible.");
  return c;
}

async function identifiant(): Promise<string> {
  const { data, error } = await client().auth.getUser();
  if (error) throw new Error(error.message);
  const id = data.user?.id;
  if (!id) throw new Error("Aucun compte connecte : impossible de gerer la photo.");
  return id;
}

/**
 * LA PHOTO DE LA PERSONNE CONNECTEE. Rend `{ path: null, url: null }` plutot
 * que de lever quand il n'y en a pas : l'absence de photo est un etat normal,
 * pas une panne.
 */
export async function loadOwnAvatar(): Promise<Avatar> {
  const c = getBrowserSupabaseClient();
  if (!c) return { path: null, url: null };

  const { data: compte } = await c.auth.getUser();
  const id = compte.user?.id;
  if (!id) return { path: null, url: null };

  const { data, error } = await c.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);

  const path = (data?.avatar_path as string | null) ?? null;
  if (path === null) return { path: null, url: null };

  return { path, url: await signAvatar(path) };
}

/**
 * SIGNER UN CHEMIN. En MEILLEUR EFFORT : une signature qui echoue rend `null`,
 * et l'ecran retombe sur les initiales. Perdre la photo est acceptable ; casser
 * la page de profil ne l'est pas.
 */
export async function signAvatar(path: string): Promise<string | null> {
  const c = getBrowserSupabaseClient();
  if (!c) return null;
  const { data, error } = await c.storage.from(SEAU).createSignedUrl(path, VALIDITE_SECONDES);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * TELEVERSER UNE NOUVELLE PHOTO. Rend le chemin ecrit dans `profiles`.
 *
 * L'ORDRE DES TROIS ECRITURES N'EST PAS ARBITRAIRE : on depose le nouvel objet,
 * PUIS on fait pointer la fiche dessus, PUIS seulement on efface l'ancien.
 * Si la mise a jour de la fiche echoue, le nouvel objet reste orphelin mais la
 * fiche pointe toujours sur une photo qui existe. Jamais l'inverse — une fiche
 * qui designe un objet supprime afficherait un trou sans explication.
 *
 * NOM ALEATOIRE A CHAQUE FOIS, plutot qu'un `avatar.jpg` ecrase : le navigateur
 * garde une image en cache par son URL, et reutiliser le chemin ferait afficher
 * l'ancienne photo apres un changement. Le cout est un effacement a faire, que
 * l'on fait.
 */
export async function uploadOwnAvatar(fichier: File): Promise<string> {
  if (!TYPES.includes(fichier.type)) {
    throw new Error("Formats acceptes : JPEG, PNG ou WebP.");
  }
  if (fichier.size > TAILLE_MAX) {
    const mo = (fichier.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Image trop lourde (${mo} Mo). Le maximum est de 2 Mo.`);
  }

  const c = client();
  const id = await identifiant();
  const extension = EXTENSIONS[fichier.type] ?? "jpg";
  const chemin = `${id}/${suffixeUnique()}.${extension}`;

  const { data: precedent } = await c
    .from("profiles")
    .select("avatar_path")
    .eq("id", id)
    .maybeSingle();
  const ancien = (precedent?.avatar_path as string | null) ?? null;

  const { error: erreurDepot } = await c.storage
    .from(SEAU)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
  if (erreurDepot) throw new Error(erreurDepot.message);

  const { error: erreurFiche } = await c
    .from("profiles")
    .update({ avatar_path: chemin })
    .eq("id", id);
  if (erreurFiche) {
    // La fiche n'a pas bouge : on retire l'objet qu'on vient de deposer plutot
    // que de laisser un orphelin qu'aucun ecran ne montrera jamais.
    await c.storage.from(SEAU).remove([chemin]);
    throw new Error(erreurFiche.message);
  }

  // Effacement en meilleur effort : un ancien fichier qui survit coute 2 Mo et
  // n'est plus designe par rien. Echouer ici ne doit pas annuler un
  // televersement reussi.
  if (ancien !== null && ancien !== chemin) {
    await c.storage.from(SEAU).remove([ancien]);
  }

  return chemin;
}

/**
 * RETIRER SA PHOTO. La fiche est videe d'abord : si l'effacement de l'objet
 * echoue ensuite, il ne reste qu'un fichier orphelin — jamais une fiche qui
 * designe un objet disparu.
 */
export async function removeOwnAvatar(): Promise<void> {
  const c = client();
  const id = await identifiant();

  const { data, error } = await c.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);

  const ancien = (data?.avatar_path as string | null) ?? null;
  if (ancien === null) return;

  const { error: erreurFiche } = await c
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", id);
  if (erreurFiche) throw new Error(erreurFiche.message);

  await c.storage.from(SEAU).remove([ancien]);
}
