/**
 * LA PAGE PUBLIQUE, SERVIE AVANT L'APPLICATION.
 *
 * POURQUOI ELLE N'EST PAS UNE ROUTE. `/` etait rendu par
 * `src/routes/index.tsx`, donc par TanStack Start : le visiteur telechargeait
 * la coquille racine, et avec elle `PasswordRecoveryGate`, qui importe le
 * client Supabase. Une personne qui n'a pas de compte payait le bundle d'une
 * application qu'elle ne peut pas ouvrir. Cette page est une CHAINE HTML
 * rendue par le Worker avant toute delegation : pas de React, pas de routeur,
 * pas de client Supabase, aucun appel reseau, et aucun octet de JavaScript.
 *
 * LES JETONS SONT DUPLIQUES ICI, ET C'EST ASSUME. Le CSS de cette page est en
 * ligne par construction : elle ne lit jamais `src/styles.css`. Les valeurs
 * ci-dessous en sont recopiees a l'identique. Toute correction se fait dans
 * `styles.css` D'ABORD, puis se reporte ici — un commentaire le rappelle des
 * deux cotes. Une duplication declaree et courte vaut mieux qu'une source de
 * verite qui se dedouble en silence.
 *
 * LE MODE SOMBRE FONCTIONNE ICI, CONTRAIREMENT A L'APPLICATION. L'application
 * n'atteint jamais son bloc `.dark` — rien ne pose cette classe. Cette page,
 * elle, lit `prefers-color-scheme` nativement : ses valeurs sombres sont donc
 * reellement affichees, et doivent etre relues comme telles.
 *
 * ⚠️ CONSEQUENCE SUR LES LIENS DE PREMIERE CONNEXION. `PasswordRecoveryGate`
 * consomme le fragment `#access_token=...&type=recovery` des la creation du
 * client Supabase. Tant que l'URL de site configuree dans Supabase pointait
 * sur la racine, cette porte devait etre au-dessus de toutes les routes. Une
 * racine sans JavaScript ne peut plus la porter : L'URL DE SITE SUPABASE DOIT
 * DESIGNER `/espace`, sans quoi les liens d'invitation et de reinitialisation
 * atterrissent sur une page qui les ignore. C'est exactement le defaut du
 * 03/09, ou l'apprenant arrivait session ouverte sans avoir pose de mot de
 * passe.
 */

/**
 * LA GRILLE DU HEROS EST CONSTRUITE ICI, PAS DANS LE NAVIGATEUR. La maquette
 * la peuplait par un script ; le meme calcul tourne cote serveur, une fois par
 * isolat, et le visiteur ne recoit que le HTML resultant.
 *
 * LES GRAPPES SONT CONTIGUES, ET C'EST LE PROPOS : un programme se lit comme
 * des domaines qui se suivent, pas comme du bruit colore. Les cases claires
 * sont les acquis valides.
 */
const TOTAL_ACQUIS = 371;
const GRAPPES: readonly (readonly [number, number, number])[] = [
  [12, 13, 1],
  [46, 9, 2],
  [74, 11, 3],
  [112, 7, 4],
  [150, 12, 5],
  [196, 9, 6],
  [238, 10, 7],
  [286, 6, 8],
  [318, 14, 1],
];
const VALIDES: readonly number[] = [3, 61, 129, 205, 301];

function grilleAcquis(): string {
  const teintes = new Array<string | null>(TOTAL_ACQUIS).fill(null);
  for (const [depart, longueur, domaine] of GRAPPES) {
    for (let k = 0; k < longueur; k += 1) teintes[depart + k] = `var(--d-${domaine})`;
  }
  for (const i of VALIDES) teintes[i] = "var(--field-ink)";
  return teintes.map((t) => (t === null ? "<i></i>" : `<i style="background:${t}"></i>`)).join("");
}

/**
 * Les valeurs sont celles de `src/styles.css`. Ne pas les corriger ici seules.
 */
const JETONS = `
:root{
  --field:oklch(0.255 0.062 255.5);
  --field-2:oklch(0.308 0.073 255.8);
  --field-ink:oklch(0.963 0.012 259.8);
  --field-mute:oklch(0.726 0.055 253.8);
  --ground:oklch(0.968 0.011 245);
  --ground-2:oklch(0.932 0.015 257.2);
  --card:oklch(1 0 0);
  --line:oklch(0.9 0.016 245);
  --line-soft:oklch(0.947 0.013 255.5);
  --ink:oklch(0.24 0.048 258);
  --ink-soft:oklch(0.439 0.062 254.1);
  --muted:oklch(0.52 0.035 254);
  --cta:oklch(0.5 0.15 245);
  --cta-ink:oklch(0.985 0.005 250);
  --live:oklch(0.804 0.156 82.5);
  --d-1:oklch(0.502 0.164 259);
  --d-2:oklch(0.537 0.092 184.1);
  --d-3:oklch(0.523 0.173 299.4);
  --d-4:oklch(0.573 0.129 54.3);
  --d-5:oklch(0.525 0.127 146.3);
  --d-6:oklch(0.544 0.17 358.1);
  --d-7:oklch(0.542 0.105 86.3);
  --d-8:oklch(0.522 0.039 253.9);
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  :root{
    --field:oklch(0.186 0.039 256.8);
    --field-2:oklch(0.241 0.049 254.5);
    --field-ink:oklch(0.947 0.02 260.2);
    --field-mute:oklch(0.669 0.052 254.2);
    --ground:oklch(0.19 0.038 258);
    --ground-2:oklch(0.167 0.031 256.3);
    --card:oklch(0.24 0.045 258);
    --line:oklch(1 0 0 / 12%);
    --line-soft:oklch(0.29 0.046 256.5);
    --ink:oklch(0.965 0.008 245);
    --ink-soft:oklch(0.808 0.039 255.6);
    --muted:oklch(0.74 0.026 250);
    --cta:oklch(0.718 0.132 257.9);
    --cta-ink:oklch(0.19 0.038 258);
    --live:oklch(0.838 0.136 84.4);
    --d-1:oklch(0.716 0.132 258.6);
    --d-2:oklch(0.715 0.109 182.8);
    --d-3:oklch(0.698 0.141 299.6);
    --d-4:oklch(0.732 0.125 61.8);
    --d-5:oklch(0.739 0.153 147.2);
    --d-6:oklch(0.718 0.151 356.5);
    --d-7:oklch(0.75 0.131 89.2);
    --d-8:oklch(0.717 0.04 252);
    color-scheme:dark;
  }
}`;

/**
 * LA TYPOGRAPHIE EST CELLE DE L'APPLICATION. La maquette composait en Archivo
 * et Archivo Narrow ; le produit compose en Public Sans, et la porte d'entree
 * doit composer comme l'espace qu'elle ouvre. Newsreader est commune aux deux,
 * mais la graisse 300 du titre et la 500 des sous-titres ne sont pas chargees
 * par l'application : cette page charge sa propre URL de police.
 *
 * LES PETITES CAPITALES reprennent exactement la regle de `milestone-heading` :
 * 11,5 px, 600, interlettrage 0,14em.
 */
const STYLE = `
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"Public Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.in{max-width:1080px;margin:0 auto;padding:0 24px}
.eyebrow{font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
a{color:inherit}

.top{background:var(--field);color:var(--field-ink)}
nav{display:flex;align-items:center;gap:12px;padding:20px 0}
.brand{display:flex;align-items:center;gap:11px;flex:1;min-width:0}
.mk{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;
  background:oklch(1 0 0 / 13%);flex:0 0 auto}
.brand b{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:19px;letter-spacing:-.01em}
.lnk{color:var(--field-mute);text-decoration:none;font-size:14px;padding:8px 4px}
.lnk:hover{color:var(--field-ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;
  border-radius:9px;text-decoration:none;font-family:inherit;font-size:14.5px;font-weight:600;
  padding:11px 20px;background:var(--cta);color:var(--cta-ink);min-height:44px}
.btn:hover{filter:brightness(1.07)}
.btn:focus-visible{outline:2px solid var(--live);outline-offset:3px}
.btn.ghost{background:transparent;color:var(--field-ink);
  box-shadow:inset 0 0 0 1px oklch(1 0 0 / 28%)}

.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:46px;align-items:center;
  padding:46px 0 62px}
.hero h1{font-family:Newsreader,Georgia,serif;font-weight:300;
  font-size:clamp(34px,5.4vw,60px);line-height:1.03;letter-spacing:-.03em;margin:16px 0 0;
  text-wrap:balance}
.hero h1 em{font-style:normal;font-weight:600}
.hero .sub{margin:22px 0 0;font-size:16.5px;line-height:1.62;color:var(--field-mute);max-width:46ch}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.who{margin-top:26px;font-size:13px;color:var(--field-mute)}
.who b{color:var(--field-ink);font-weight:600}

.grid{display:grid;grid-template-columns:repeat(19,1fr);gap:5px}
.grid i{display:block;aspect-ratio:1;border-radius:2px;background:oklch(1 0 0 / 10%)}
.legend{display:flex;flex-wrap:wrap;gap:7px 16px;margin-top:18px;font-size:11.5px;
  color:var(--field-mute)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend u{width:9px;height:9px;border-radius:2px;text-decoration:none;display:block;flex:0 0 auto}

@media (max-width:860px){
  .hero{grid-template-columns:1fr;gap:34px;padding:34px 0 48px}
  .grid{grid-template-columns:repeat(24,1fr);gap:4px}
  nav{flex-wrap:wrap;gap:8px 12px}
  .brand{flex:1 0 100%}
}

/* ⚠️ UN SEUL APPEL A SE CONNECTER SUR TELEPHONE — corrige le 11/09 sur constat
   de Stef. « Se connecter » dans la barre et « Acceder a mon passeport » dans
   le titre pointent tous deux vers /espace : sur un grand ecran ils sont
   eloignes et se lisent comme une convention et une promesse ; empiles sur un
   telephone, ce sont deux boutons cote a cote pour une seule action, et on
   hesite. On garde celui du titre, qui dit ce qu'on y trouve. */
@media (max-width:640px){
  nav .btn{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

const MARQUE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 8.6a5 5 0 0 0-8.8-2.9 5 5 0 0 0-8.8 2.9c0 1 .3 1.9.8 2.7h3.6l1.4-2.6 2.2 5.6 1.9-3.6 1.1 1.4h3.8c.5-.8.8-1.7.8-2.5Z"></path><path d="M4.6 12.7c1.8 2.7 5.2 5.4 7.4 6.9 2.2-1.5 5.6-4.2 7.4-6.9"></path></svg>`;

const TITRE = "Campus Santé Augmenté — le passeport éducatif des études médicales";
const DESCRIPTION =
  "Un passeport éducatif qui suit vos connaissances et vos compétences, et un plan daté qui vous dit par quoi commencer — de la première lecture jusqu'à la validation par votre encadrant de stage.";

export const PAGE_ACCUEIL_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TITRE}</title>
<meta name="description" content="${DESCRIPTION}">
<meta property="og:title" content="${TITRE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@400;500;600&display=swap">
<style>${JETONS}${STYLE}</style>
</head>
<body>
<div class="top">
  <div class="in">
    <nav>
      <span class="brand"><span class="mk">${MARQUE}</span><b>Campus Santé Augmenté</b></span>
      <a class="lnk" href="#passeport">Le passeport</a>
      <a class="lnk" href="#plan">Le plan</a>
      <a class="lnk" href="#assistant">L'assistant</a>
      <a class="lnk" href="#enseigner">Enseigner</a>
      <a class="btn" href="/espace">Se connecter</a>
    </nav>

    <div class="hero">
      <div>
        <span class="eyebrow" style="color:var(--field-mute)">Études médicales · Formation continue</span>
        <h1>Ce que vous savez.<br>Ce que vous savez <em>faire</em>.<br>Et comment y arriver.</h1>
        <p class="sub">${DESCRIPTION}</p>
        <div class="acts">
          <a class="btn" href="/espace">Accéder à mon passeport</a>
          <a class="btn ghost" href="#passeport">Comment ça marche</a>
        </div>
        <p class="who">Pour les étudiants en <b>DFASM</b>, les internes, et les cardiologues en <b>DIU</b> ou en développement professionnel continu.</p>
      </div>
      <div>
        <div class="grid" role="img" aria-label="Les ${TOTAL_ACQUIS} acquis d'un programme, groupés par domaine de compétence">${grilleAcquis()}</div>
        <div class="legend">
          <span><u style="background:var(--field-ink)"></u> acquis validé</span>
          <span><u style="background:var(--d-1)"></u> examen clinique</span>
          <span><u style="background:var(--d-2)"></u> interrogatoire</span>
          <span><u style="background:var(--d-3)"></u> relationnel</span>
          <span><u style="background:var(--d-5)"></u> ECG</span>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

/**
 * Rend la page publique pour `GET /` et `HEAD /`, et seulement pour elle.
 * Tout le reste retombe sur l'application. `null` veut dire « ce n'est pas
 * pour moi », et c'est le Worker qui delegue.
 */
export function servirPageAccueil(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const chemin = new URL(request.url).pathname;
  if (chemin !== "/") return null;
  return new Response(request.method === "HEAD" ? null : PAGE_ACCUEIL_HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
