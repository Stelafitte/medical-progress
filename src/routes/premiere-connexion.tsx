import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { SupabasePasswordForm } from "@/components/supabase-password-form";
import { EtapeIdentite } from "@/application/password-recovery-gate";
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";

/**
 * LA PAGE DE PREMIÈRE CONNEXION — le lien du courriel mène ICI, plus à Supabase.
 *
 * LE DÉFAUT CORRIGÉ (18/09). Le courriel portait le lien Supabase direct
 * (`/auth/v1/verify?token=…`), qui CONSOMME le jeton dès qu'on l'ouvre. Or les
 * messageries des CHU et des universités ouvrent chaque lien pour l'analyser
 * avant le destinataire. Mesuré sur l'adresse CHU de Stef : le robot a usé le
 * lien, Stef est arrivé sur `#error_code=otp_expired` quelques minutes après
 * l'envoi. Presque tous nos étudiants et encadrants ont ce genre de protection.
 *
 * LA PARADE (celle que recommande Supabase) : le courriel ne porte plus que le
 * `token_hash`. Cette page ne l'échange contre une session (`verifyOtp`) QU'AU
 * CLIC sur le bouton. Un robot ouvre la page, il ne clique pas : le jeton reste
 * intact pour la personne.
 */
type Etape = "attente" | "activation" | "identite" | "mot_de_passe" | "echec";

export const Route = createFileRoute("/premiere-connexion")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { token_hash?: string; type?: "invite" | "recovery" } => {
    const token = search["token_hash"];
    const type = search["type"];
    return {
      ...(typeof token === "string" && token.length > 0 ? { token_hash: token } : {}),
      ...(type === "invite" || type === "recovery" ? { type } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Première connexion — Campus Santé Augmenté" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PremiereConnexion,
});

function PremiereConnexion() {
  const { token_hash: tokenHash, type } = Route.useSearch();
  const client = getBrowserSupabaseClient();
  const [etape, setEtape] = useState<Etape>("attente");

  async function activer() {
    if (!client || !tokenHash || !type) return;
    setEtape("activation");
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: type satisfies EmailOtpType,
    });
    setEtape(error ? "echec" : "identite");
  }

  if (etape === "identite") return <EtapeIdentite onDone={() => setEtape("mot_de_passe")} />;

  if (etape === "mot_de_passe" && client) {
    return (
      <SupabasePasswordForm client={client} onDone={() => window.location.replace("/espace")} />
    );
  }

  const lienIncomplet = !tokenHash || !type;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="space-y-3">
        {etape === "echec" || lienIncomplet ? (
          <>
            <h1 className="text-xl font-semibold">Ce lien n'est plus valable</h1>
            <p className="text-sm text-muted-foreground">
              Un lien de première connexion ne sert qu'une seule fois et expire après un délai.
              Demandez-en un nouveau à l'équipe pédagogique, ou connectez-vous si vous avez déjà un
              mot de passe.
            </p>
            <Button className="min-h-11" onClick={() => window.location.replace("/espace")}>
              Aller à la connexion
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Activer votre compte</h1>
            <p className="text-sm text-muted-foreground">
              Vous allez vérifier vos informations, puis choisir votre mot de passe.
            </p>
            <Button
              className="min-h-11"
              disabled={etape === "activation" || !client}
              onClick={() => void activer()}
            >
              {etape === "activation" ? "Activation…" : "Activer mon compte"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
