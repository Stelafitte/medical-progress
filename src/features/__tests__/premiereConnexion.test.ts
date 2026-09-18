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
    for (const [source, type] of [
      [invite, '"invite"'],
      [resend, '"recovery"'],
    ] as const) {
      expect(source).not.toContain("link.properties.action_link,");
      expect(source).toContain(`premiereConnexionUrl(link.properties.hashed_token, ${type})`);
      expect(source).toContain("/premiere-connexion?");
    }
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
