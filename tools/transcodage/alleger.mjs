/*
 * ALLÉGER LES MÉDIAS D'UN PROGRAMME — outil d'administration, à lancer sur le
 * PC de Stef.
 *
 * POURQUOI ICI ET PAS AILLEURS. Ni le conteneur cloud ni la VM Linux du pont
 * n'ont de réseau vers `supabase.co` (mesuré le 03/09 : HTTP 000). Ce PC est
 * le seul endroit qui ait à la fois `ffmpeg` et l'accès au stockage.
 *
 * LES RÉGLAGES, TRANCHÉS PAR STEF LE 17/09 APRÈS AVOIR REGARDÉ SES BOUCLES :
 *   imagerie diagnostique  CRF 23, résolution et cadence INTACTES      −51 %
 *   animations, séquences  CRF 28 en 720p                       −95 à −98 %
 *   narration              AAC 64 kbit/s mono                          −62 %
 *
 * LE DÉFAUT EST CONSERVATEUR : toute vidéo est traitée comme de l'imagerie.
 * Les animations ne prennent le profil agressif que si on les DÉSIGNE, avec
 * `--anime <fragment de nom>`. Se tromper dans ce sens coûte quelques
 * mégaoctets ; se tromper dans l'autre abîme du matériel d'enseignement.
 *
 * L'ORIGINAL N'EST JAMAIS TOUCHÉ. L'outil dépose un NOUVEL objet et appelle
 * `register_lightened_asset`. La base refuse d'elle-même une dérivée plus
 * lourde que sa source, et une dérivée de dérivée.
 *
 * L'AUTHENTIFICATION : PAS DE CLÉ DE SERVICE SUR LE DISQUE. L'outil demande
 * l'adresse et le mot de passe de l'administrateur au lancement, s'en sert une
 * fois pour ouvrir une session, et ne les écrit nulle part. Une clé
 * `service_role` posée dans un fichier contournerait toute la RLS et vivrait
 * là pour toujours ; un mot de passe tapé à chaque exécution ne survit pas à
 * la commande. L'outil agit donc avec EXACTEMENT les droits de Stef, ni plus.
 *
 * REJOUABLE. `assets_to_lighten()` ne rend que ce qui n'a pas encore sa
 * version allégée : relancer après une coupure reprend où ça s'était arrêté,
 * sans refaire le travail fait.
 *
 * Usage :
 *   node alleger.mjs                      → ESSAI : mesure et transcode en
 *                                           local, n'écrit RIEN en base ni
 *                                           dans le stockage.
 *   node alleger.mjs --go                 → applique pour de vrai.
 *   node alleger.mjs --go --anime anim    → les objets dont le chemin contient
 *                                           « anim » prennent le profil animation.
 *   node alleger.mjs --programme <uuid>   → se limite à un programme.
 *   node alleger.mjs --max 3              → s'arrête après 3 objets (pour essayer).
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const aOption = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const POUR_DE_VRAI = args.includes("--go");
const PROGRAMME = aOption("--programme");
const MAX = Number(aOption("--max") ?? "0") || 0;
const FRAGMENTS_ANIME = args
  .map((a, i) => (a === "--anime" ? args[i + 1] : null))
  .filter((x) => x && !x.startsWith("--"));

/* ------------------------------------------------------------------ */
/* Environnement                                                       */
/* ------------------------------------------------------------------ */

function lireEnv() {
  /* On lit `.env.local` du dépôt : l'URL et la clé publique y sont déjà, et ce
     fichier est ignoré par git (`*.local`). Rien à recopier à la main. */
  const candidats = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
  ];
  for (const f of candidats) {
    try {
      const texte = readFileSync(f, "utf8");
      const lu = {};
      for (const ligne of texte.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
        if (m) lu[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
      const url = lu["VITE_SUPABASE_URL"];
      const cle = lu["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? lu["VITE_SUPABASE_ANON_KEY"];
      if (url && cle) return { url: url.replace(/\/+$/, ""), cle, depuis: f };
    } catch {
      /* fichier absent : on essaie le suivant */
    }
  }
  throw new Error(
    "Introuvable : VITE_SUPABASE_URL et la clé publique. Lance l'outil depuis le dépôt, ou place-le dans tools/transcodage/.",
  );
}

/* ------------------------------------------------------------------ */
/* Saisie                                                             */
/* ------------------------------------------------------------------ */

function demander(question, masque = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (masque) {
      /* Le mot de passe ne s'affiche pas, et il ne part nulle part ailleurs
         que dans l'appel d'ouverture de session. */
      const ecrire = rl.output.write.bind(rl.output);
      rl.output.write = (c) => (/\n|\r/.test(c) ? ecrire(c) : ecrire("*"));
      rl.question(question, (r) => {
        rl.output.write = ecrire;
        rl.output.write("\n");
        rl.close();
        resolve(r.trim());
      });
      return;
    }
    rl.question(question, (r) => {
      rl.close();
      resolve(r.trim());
    });
  });
}

/* ------------------------------------------------------------------ */
/* ffmpeg                                                             */
/* ------------------------------------------------------------------ */

function lancer(commande, arguments_) {
  return new Promise((resolve, reject) => {
    const p = spawn(commande, arguments_, { windowsHide: true });
    let sortie = "";
    let erreur = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (erreur += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(sortie) : reject(new Error(`${commande} (code ${code}) : ${erreur.slice(-400)}`)),
    );
  });
}

async function sonder(fichier) {
  const brut = await lancer("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,codec_name",
    "-show_entries", "format=duration",
    "-of", "json",
    fichier,
  ]);
  const j = JSON.parse(brut);
  const v = j.streams?.[0] ?? {};
  const [num, den] = String(v.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    largeur: v.width ?? 0,
    hauteur: v.height ?? 0,
    fps: den ? num / den : 0,
    codec: v.codec_name ?? "?",
    secondes: Number(j.format?.duration ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* CE QUI EST DÉJÀ SERRÉ NE S'ALLÈGE PAS                               */
/*                                                                     */
/* Leçon du premier essai réel, 17/09 au soir. Une vidéo déjà codée à  */
/* 506 kbit/s est ressortie 65 % PLUS LOURDE : CRF 23 est une cible de */
/* QUALITÉ, pas de taille. Demander cette qualité à une source déjà    */
/* compressée fait dépenser des bits pour préserver fidèlement ses     */
/* propres artefacts.                                                  */
/*                                                                     */
/* LA MESURE QUI TRANCHE : les bits par pixel et par image. Elle ne    */
/* dépend ni de la résolution ni de la durée, seulement de la densité  */
/* de codage. Mesuré sur les fichiers réels :                          */
/*                                                                     */
/*   boucle d'écho brute (PPTX)   0,318 bpp   → très sur-codée         */
/*   vidéo myDFASM                0,022 bpp   → déjà serrée            */
/*   slide_video du DIU publié    0,014 bpp   → déjà serrée            */
/*                                                                     */
/* Un facteur 15 à 20 sépare les deux familles : le seuil est franc.   */
/* ------------------------------------------------------------------ */

const BPP_PLANCHER = 0.08;
/* Pour la parole, 64 kbit/s suffit ; en dessous de 80 il n'y a plus rien
   à prendre, et on abîmerait pour rien. */
const AUDIO_KBIT_PLANCHER = 80;

/** Vrai si la source a encore du gras. `null` = on ne sait pas, on tente. */
function vautLaPeine(mediaType, info, octets) {
  if (!info.secondes || info.secondes <= 0) return { oui: true, pourquoi: "" };
  const kbit = (octets * 8) / info.secondes / 1000;
  if (mediaType.startsWith("audio/")) {
    return kbit > AUDIO_KBIT_PLANCHER
      ? { oui: true, pourquoi: `${Math.round(kbit)} kbit/s` }
      : { oui: false, pourquoi: `déjà à ${Math.round(kbit)} kbit/s, rien à prendre` };
  }
  if (!info.largeur || !info.hauteur || !info.fps) return { oui: true, pourquoi: "" };
  const bpp = (kbit * 1000) / (info.largeur * info.hauteur * info.fps);
  return bpp > BPP_PLANCHER
    ? { oui: true, pourquoi: `${bpp.toFixed(3)} bpp — sur-codée` }
    : { oui: false, pourquoi: `${bpp.toFixed(3)} bpp, déjà codée serré` };
}

/* ------------------------------------------------------------------ */
/* Les deux profils, et rien d'autre                                   */
/* ------------------------------------------------------------------ */

function profilPour(mediaType, objectPath) {
  if (mediaType.startsWith("audio/")) {
    return {
      nom: "audio aac 64k mono",
      extension: ".m4a",
      type: "audio/mp4",
      argumentsDe: () => ["-vn", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart"],
    };
  }
  const estAnime = FRAGMENTS_ANIME.some((f) => objectPath.toLowerCase().includes(f.toLowerCase()));
  if (estAnime) {
    return {
      nom: "video crf 28 720p",
      extension: ".mp4",
      type: "video/mp4",
      argumentsDe: () => [
        "-vf", "scale='min(1280,iw)':-2",
        "-c:v", "libx264", "-preset", "slow", "-crf", "28",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
      ],
    };
  }
  return {
    nom: "video crf 23",
    extension: ".mp4",
    type: "video/mp4",
    /*
     * IMAGERIE : on ne touche NI à la résolution NI à la cadence. Les boucles
     * sortent en ~650x580 de l'appareil, et 50-60 images/s est de la
     * résolution TEMPORELLE — sur du mouvement pariétal, ça se paie.
     *
     * H.264 exige des dimensions paires, et les boucles sont en 649x577.
     * On REMPLIT d'un pixel noir (`pad`) : ça ne touche aucun pixel d'origine,
     * là où un redimensionnement rééchantillonnerait toute l'image.
     */
    argumentsDe: () => [
      "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:v", "libx264", "-preset", "slow", "-crf", "23",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

class Supabase {
  constructor(url, cle) {
    this.url = url;
    this.cle = cle;
    this.jeton = null;
  }
  get entetes() {
    return { apikey: this.cle, Authorization: `Bearer ${this.jeton ?? this.cle}` };
  }
  async ouvrirSession(email, motDePasse) {
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: this.cle, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: motDePasse }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) {
      throw new Error(`Session refusée : ${j.error_description ?? j.msg ?? r.status}`);
    }
    this.jeton = j.access_token;
    return j.user?.email ?? email;
  }
  async rpc(nom, corps) {
    const r = await fetch(`${this.url}/rest/v1/rpc/${nom}`, {
      method: "POST",
      headers: { ...this.entetes, "Content-Type": "application/json" },
      body: JSON.stringify(corps ?? {}),
    });
    const texte = await r.text();
    if (!r.ok) throw new Error(`${nom} : ${r.status} ${texte.slice(0, 300)}`);
    return texte ? JSON.parse(texte) : null;
  }
  async telecharger(seau, chemin, vers) {
    const r = await fetch(`${this.url}/storage/v1/object/${seau}/${encodeURI(chemin)}`, {
      headers: this.entetes,
    });
    if (!r.ok) throw new Error(`téléchargement ${chemin} : ${r.status}`);
    writeFileSync(vers, Buffer.from(await r.arrayBuffer()));
  }
  async televerser(seau, chemin, fichier, type) {
    /* Le fichier entier en mémoire plutôt qu'un flux : ces médias font quelques
       mégaoctets, et un flux en corps de requête dépend de détails d'undici qui
       changent d'une version de Node à l'autre. Ici, ça ne peut pas échouer
       pour une raison qu'on ne comprendrait pas à 22 h. */
    const r = await fetch(`${this.url}/storage/v1/object/${seau}/${encodeURI(chemin)}`, {
      method: "POST",
      headers: { ...this.entetes, "Content-Type": type, "x-upsert": "true" },
      body: readFileSync(fichier),
    });
    if (!r.ok) throw new Error(`téléversement ${chemin} : ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Le travail                                                          */
/* ------------------------------------------------------------------ */

const ko = (o) => `${Math.round(o / 1024).toLocaleString("fr-FR")} ko`;

async function principal() {
  const env = lireEnv();
  console.log(`\nBase        : ${env.url}`);
  console.log(`Lue dans    : ${env.depuis}`);
  console.log(
    POUR_DE_VRAI
      ? "Mode        : POUR DE VRAI — dépose et enregistre\n"
      : "Mode        : ESSAI — mesure seulement, rien n'est écrit (ajoute --go pour appliquer)\n",
  );

  for (const outil of ["ffmpeg", "ffprobe"]) {
    try {
      await lancer(outil, ["-version"]);
    } catch {
      throw new Error(`${outil} est introuvable. Installe-le, ou ajoute-le au PATH.`);
    }
  }

  const sb = new Supabase(env.url, env.cle);
  const email = await demander("Adresse de votre compte Campus : ");
  const motDePasse = await demander("Mot de passe (masqué)         : ", true);
  const qui = await sb.ouvrirSession(email, motDePasse);
  console.log(`Session ouverte : ${qui}\n`);

  let liste;
  try {
    liste = await sb.rpc("assets_to_lighten", { p_program_id: PROGRAMME ?? null });
  } catch (raison) {
    if (/PGRST202|404|not find/i.test(raison.message)) {
      throw new Error(
        "La base ne connaît pas `assets_to_lighten`. La migration 20260917230000_version_allegee_dun_media.sql n'a pas encore été passée : colle-la dans l'éditeur SQL de Supabase, puis relance.",
      );
    }
    throw raison;
  }
  if (!Array.isArray(liste) || liste.length === 0) {
    console.log("Rien à alléger : tout est déjà traité, ou rien ne dépasse le seuil.");
    return;
  }

  const aFaire = MAX > 0 ? liste.slice(0, MAX) : liste;
  console.log(`${liste.length} média(s) à alléger, ${aFaire.length} traité(s) dans ce passage.\n`);

  const dossier = mkdtempSync(path.join(tmpdir(), "alleger-"));
  let avant = 0;
  let apres = 0;
  let faits = 0;
  let ignores = 0;
  const echecs = [];

  try {
    for (const [i, a] of aFaire.entries()) {
      const etiquette = `[${i + 1}/${aFaire.length}] ${a.resource_title} — ${path.basename(a.object_path)}`;
      try {
        const profil = profilPour(a.media_type ?? "", a.object_path);
        const source = path.join(dossier, "src" + path.extname(a.object_path));
        const cible = path.join(dossier, "out" + profil.extension);

        await sb.telecharger(a.bucket_name, a.object_path, source);
        const info = await sonder(source);
        const poidsAvant = statSync(source).size;

        /* On mesure AVANT de transcoder : inutile de brûler du calcul sur une
           source qui n'a plus de gras. */
        const verdict = vautLaPeine(a.media_type ?? "", info, poidsAvant);
        const detailSource = info.largeur
          ? `${info.largeur}×${info.hauteur} ${Math.round(info.fps)} i/s ${info.secondes.toFixed(1)} s`
          : `${info.secondes.toFixed(1)} s`;
        if (!verdict.oui) {
          console.log(`${etiquette}\n    ${detailSource} · ${ko(poidsAvant)}`);
          console.log(`    laissée telle quelle : ${verdict.pourquoi}\n`);
          ignores += 1;
          rmSync(source, { force: true });
          continue;
        }

        await lancer("ffmpeg", ["-v", "error", "-y", "-i", source, ...profil.argumentsDe(), cible]);

        const poidsApres = statSync(cible).size;
        const gain = Math.round(100 - (100 * poidsApres) / poidsAvant);

        console.log(`${etiquette}\n    ${detailSource} · ${profil.nom} · ${verdict.pourquoi}`);
        console.log(`    ${ko(poidsAvant)} → ${ko(poidsApres)}  (−${gain} %)`);

        if (poidsApres >= poidsAvant) {
          console.log("    ignoré : la version produite n'est pas plus légère.\n");
          rmSync(source, { force: true });
          rmSync(cible, { force: true });
          continue;
        }

        avant += poidsAvant;
        apres += poidsApres;

        if (POUR_DE_VRAI) {
          const cheminCible =
            a.object_path.replace(/\.[^./]+$/, "") + ".allege" + profil.extension;
          await sb.televerser(a.bucket_name, cheminCible, cible, profil.type);
          await sb.rpc("register_lightened_asset", {
            p_source_asset_id: a.asset_id,
            p_object_path: cheminCible,
            p_byte_size: poidsApres,
            p_media_type: profil.type,
            p_note: profil.nom,
          });
          console.log(`    déposé et enregistré : ${cheminCible}\n`);
        } else {
          console.log("    (essai : rien n'a été déposé)\n");
        }

        faits += 1;
        rmSync(source, { force: true });
        rmSync(cible, { force: true });
      } catch (raison) {
        /* Un média en échec n'arrête pas les autres : on le dit, et on continue.
           Le prochain passage le reprendra, puisque rien n'a été enregistré. */
        console.log(`${etiquette}\n    ÉCHEC : ${raison.message}\n`);
        echecs.push(`${path.basename(a.object_path)} : ${raison.message}`);
      }
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }

  console.log("─".repeat(64));
  console.log(`${faits} média(s) allégé(s) : ${ko(avant)} → ${ko(apres)}`);
  if (ignores > 0) console.log(`${ignores} laissé(s) tel(s) quel(s) : déjà codé(s) serré.`);
  if (avant > 0) console.log(`Gain total : −${Math.round(100 - (100 * apres) / avant)} %`);
  if (echecs.length > 0) {
    console.log(`\n${echecs.length} échec(s) — relance l'outil, ils seront repris :`);
    for (const e of echecs) console.log(`  · ${e}`);
  }
  if (!POUR_DE_VRAI) {
    console.log("\nC'était un ESSAI. Relance avec --go pour appliquer.");
  }
}

principal().catch((raison) => {
  console.error(`\nARRÊT : ${raison.message}\n`);
  process.exitCode = 1;
});
