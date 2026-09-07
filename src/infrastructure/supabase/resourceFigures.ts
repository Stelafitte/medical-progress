import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";

/**
 * LES FIGURES D'UN CHAPITRE — 196 illustrations du referentiel.
 *
 * MON ERREUR DU 07/09, consignee pour qu'elle ne soit pas refaite : j'ai lu
 * `learning_resource_texts`, constate qu'elle ne contient que du texte, et
 * conclu « il n'y a pas d'images ». Les medias n'ont JAMAIS ete dans cette
 * table. Ils sont dans `learning_resource_assets`, avec `kind = 'illustration'`,
 * dans le seau `course-sources`. Ne pas trouver dans une table n'est pas une
 * preuve d'absence.
 *
 * LE SEAU EST PRIVE, ET IL DOIT LE RESTER. Les images sont servies par URL
 * signee, valables une heure, et signees EN LOT par chapitre : une requete par
 * image ferait 62 aller-retours sur le chapitre 15.
 *
 * LES LEGENDES sont dans `referentiel_figures`, jointes par le numero extrait
 * du chemin. Cette table n'a pas de migration dans le depot — la lecture est
 * donc en MEILLEUR EFFORT : si elle echoue, on rend les images sans legende
 * plutot que de perdre les images.
 */

export type Figure = {
  readonly assetId: string;
  readonly objectPath: string;
  /** « 5.1 », extrait de `referentiel-figures/fig-5.1.jpg`. */
  readonly num: string;
  readonly chapitre: number;
  readonly ordre: number;
  readonly url: string;
  readonly legende?: string;
};

const PREFIXE = "referentiel-figures/fig-";

/** « referentiel-figures/fig-5.12.jpg » -> { num: "5.12", chapitre: 5, ordre: 12 } */
function decouper(objectPath: string) {
  const brut = objectPath.startsWith(PREFIXE) ? objectPath.slice(PREFIXE.length) : "";
  const num = brut.replace(/\.[a-z0-9]+$/i, "");
  const [chapitre, ordre] = num.split(".");
  return {
    num,
    chapitre: Number.parseInt(chapitre ?? "", 10),
    ordre: Number.parseInt(ordre ?? "", 10),
  };
}

export async function listResourceFigures(
  resourceIds: readonly string[],
): Promise<readonly Figure[]> {
  const client = getBrowserSupabaseClient();
  if (!client || resourceIds.length === 0) return [];

  const { data, error } = await client
    .from("learning_resource_assets")
    .select("id,object_path,bucket_name")
    .in("resource_id", [...resourceIds])
    .eq("kind", "illustration")
    .eq("processing_status", "ready")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as { id: string; object_path: string; bucket_name: string }[];
  if (lignes.length === 0) return [];

  /*
   * SIGNATURE EN LOT, groupee par seau. `createSignedUrls` rend les URL dans
   * l'ordre des chemins demandes : on ne peut donc pas se contenter de les
   * apparier au hasard, l'index fait foi.
   */
  const parSeau = new Map<string, typeof lignes>();
  for (const ligne of lignes) {
    parSeau.set(ligne.bucket_name, [...(parSeau.get(ligne.bucket_name) ?? []), ligne]);
  }
  const urls = new Map<string, string>();
  await Promise.all(
    [...parSeau.entries()].map(async ([seau, deSeau]) => {
      const { data: signees, error: erreurSignature } = await client.storage
        .from(seau)
        .createSignedUrls(
          deSeau.map((l) => l.object_path),
          3600,
        );
      if (erreurSignature) return;
      for (const [i, entree] of (signees ?? []).entries()) {
        const ligne = deSeau[i];
        if (ligne && entree?.signedUrl) urls.set(ligne.id, entree.signedUrl);
      }
    }),
  );

  const figures = lignes
    .map((ligne) => {
      const url = urls.get(ligne.id);
      if (url === undefined) return undefined;
      const { num, chapitre, ordre } = decouper(ligne.object_path);
      return { assetId: ligne.id, objectPath: ligne.object_path, num, chapitre, ordre, url };
    })
    .filter((f): f is Omit<Figure, "legende"> => f !== undefined)
    .sort((a, b) => a.chapitre - b.chapitre || a.ordre - b.ordre);

  /* LES LEGENDES, en meilleur effort : leur absence ne doit pas coûter les images. */
  let legendes = new Map<string, string>();
  try {
    const { data: rows } = await client
      .from("referentiel_figures")
      .select("num,legende")
      .in(
        "num",
        figures.map((f) => f.num),
      );
    legendes = new Map(
      ((rows ?? []) as { num: string | number; legende: string }[]).map(
        (r) => [String(r.num), r.legende] as const,
      ),
    );
  } catch {
    /* table absente ou illisible : on continue sans legende */
  }

  return figures.map((f) => {
    const legende = legendes.get(f.num);
    return legende === undefined ? f : { ...f, legende };
  });
}
