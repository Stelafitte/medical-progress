// supabase/functions/lien/index.ts
//
// 22/09 -- LE LIEN DES COURRIELS NE PORTE PLUS « workers.dev ».
//
// CONSTAT (tests d'acheminement du 22/09 au matin, boite echobordeaux) : le
// serveur d'envoi d'OVH ACCEPTE (250 queued) tout courriel qui contient une
// adresse en *.workers.dev, puis NE LE LIVRE JAMAIS — sans rejet ni retour.
// Le meme courriel avec un lien supabase.co ou dfasm-connect.fr arrive. Le
// domaine workers.dev, tres utilise par l'hameconnage, est filtre en sortie.
// C'est pourquoi aucun etudiant n'a clique : les invitations du 21/09 ne leur
// sont jamais parvenues.
//
// Le courriel pointe donc ici (supabase.co), et cette fonction renvoie aussitot
// vers la page de premiere connexion. Elle ne lit ni n'ecrit rien : le jeton
// n'est echange qu'au clic sur « Activer mon compte », par claim-invitation.
// Le jour ou le site aura son propre domaine (app.dfasm-connect.fr), il
// suffira de changer PUBLIC_APP_URL.

const APP_URL = (
  Deno.env.get("PUBLIC_APP_URL") ?? "https://stelafitte-medical-progress.dfasm-connect.workers.dev"
).replace(/\/+$/, "");

Deno.serve((req) => {
  const url = new URL(req.url);
  const jeton = url.searchParams.get("i") ?? "";
  const cible = /^[A-Za-z0-9_-]{16,128}$/.test(jeton)
    ? `${APP_URL}/premiere-connexion?${new URLSearchParams({ invitation: jeton }).toString()}`
    : `${APP_URL}/premiere-connexion`;
  return new Response(null, {
    status: 302,
    headers: { Location: cible, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
});
