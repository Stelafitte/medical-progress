import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("src/routes/premiere-connexion.tsx");
const invite = read("supabase/functions/invite-person/index.ts");
const resend = read("supabase/functions/resend-first-login/index.ts");

describe("première connexion à l'épreuve des robots de messagerie (18/09)", () => {
  it("n'échange le jeton qu'au clic, jamais au chargement de la page", () => {
    expect(page).toContain("client.auth.verifyOtp");
    // Le seul appel est dans `activer`, déclenché par le bouton.
    expect(page.match(/auth\.verifyOtp\(/g)).toHaveLength(1);
    expect(page).toContain("onClick={() => void activer()}");
    expect(page).not.toMatch(/useEffect/);
  });

  it("mène le parcours complet : identité, puis mot de passe", () => {
    expect(page).toContain("<EtapeIdentite");
    expect(page).toContain("<SupabasePasswordForm");
    expect(page).toContain('{ name: "robots", content: "noindex" }');
  });

  it("n'est pas interceptée par la barrière de récupération de la racine", () => {
    const gate = read("src/application/password-recovery-gate.tsx");
    expect(gate).toContain('if (PAGE_PREMIERE_CONNEXION) return "aucun";');
  });

  it("n'envoie plus le lien Supabase direct dans les courriels", () => {
    for (const source of [invite, resend]) {
      expect(source).not.toContain("link.properties.action_link,");
      expect(source).not.toContain("premiereConnexionUrl(");
      // 22/09 : le courriel passe par la fonction `lien` (supabase.co), jamais par
      // workers.dev, que le serveur d'envoi d'OVH supprime sans le livrer.
      expect(source).toContain("/functions/v1/lien?");
    }
  });
});

describe("liens d'invitation valables 7 jours (21/09)", () => {
  const migration = read("supabase/migrations/20260921090000_liens_invitation_7_jours.sql");
  const claim = read("supabase/functions/claim-invitation/index.ts");
  const redemande = read("supabase/functions/request-new-link/index.ts");

  it("le courriel porte notre jeton, dont seule l'empreinte est en base", () => {
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain(
      "revoke all on public.invitation_links from public, anon, authenticated",
    );
    for (const source of [invite, resend, redemande]) {
      expect(source).toContain("await lienInvitation(adminClient");
      expect(source).toContain('crypto.subtle.digest("SHA-256"');
    }
  });

  it("le lien Supabase n'est fabriqué qu'au clic, puis échangé aussitôt", () => {
    expect(claim).toContain("generateLink");
    expect(page).toContain("client.functions.invoke<");
    expect(page).toContain('"claim-invitation"');
  });

  it("un lien expiré n'est plus une impasse, et ne dit pas qui est inscrit", () => {
    expect(page).toContain("Recevoir un nouveau lien");
    expect(redemande).toContain("return json({ ok: true }, 200);");
    expect(redemande).toContain("120_000");
  });
});

describe("contenu servi seulement après l'ouverture de la promotion (18/09)", () => {
  const migration = read("supabase/migrations/20260918150000_contenu_apres_ouverture.sql");
  const dashboard = read("src/features/dashboard/DashboardView.tsx");

  it("la base exige une promotion ouverte, en cours ou terminée", () => {
    expect(migration).toContain("c.status in ('open', 'in_progress', 'completed')");
    expect(migration).toContain("create policy programs_select_scoped");
  });

  it("l'étudiant d'une promotion en brouillon lit un message, pas des zéros", () => {
    expect(dashboard).toContain("Votre promotion n'est pas encore ouverte");
    expect(dashboard).toContain('cohort.status === "draft"');
  });
});

describe("aucun workers.dev dans les courriels (22/09)", () => {
  it("la redirection vit sur supabase.co et vise la page de première connexion", () => {
    const lien = read("supabase/functions/lien/index.ts");
    expect(lien).toContain("status: 302");
    expect(lien).toContain("/premiere-connexion?");
    for (const f of [
      "invite-person",
      "resend-first-login",
      "request-new-link",
      "relance-excuses",
    ]) {
      expect(read(`supabase/functions/${f}/index.ts`)).toContain("/functions/v1/lien?");
    }
  });
});
