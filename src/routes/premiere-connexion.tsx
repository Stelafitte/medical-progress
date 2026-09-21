import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
/*
 * 21/09 -- LE LIEN VAUT 7 JOURS. Le courriel porte `?invitation=<jeton>`, un
 * jeton a nous : au clic, `claim-invitation` le verifie et rend un lien
 * Supabase frais, echange aussitot. Les anciens liens (`token_hash`, une heure
 * de vie) restent acceptes. Et un lien expire n'est plus une impasse :
 * l'etudiant redemande lui-meme un lien, sans passer par l'equipe.
 */
type Etape = "attente" | "activation" | "identite" | "mot_de_passe" | "echec";

export const Route = createFileRoute("/premiere-connexion")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { invitation?: string; token_hash?: string; type?: "invite" | "recovery" } => {
    const invitation = search["invitation"];
    const token = search["token_hash"];
    const type = search["type"];
    return {
      ...(typeof invitation === "string" && invitation.length > 0 ? { invitation } : {}),
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
  const { invitation, token_hash: tokenHash, type } = Route.useSearch();
  const client = getBrowserSupabaseClient();
  const [etape, setEtape] = useState<Etape>("attente");

  async function activer() {
    if (!client) return;
    setEtape("activation");
    let jeton = tokenHash;
    let nature: EmailOtpType | undefined = type;
    if (invitation) {
      const { data, error } = await client.functions.invoke<{
        token_hash: string;
        type: "invite" | "recovery";
      }>("claim-invitation", { body: { invitation } });
      if (error || !data?.token_hash) {
        setEtape("echec");
        return;
      }
      jeton = data.token_hash;
      nature = data.type;
    }
    if (!jeton || !nature) {
      setEtape("echec");
      return;
    }
    const { error } = await client.auth.verifyOtp({ token_hash: jeton, type: nature });
    setEtape(error ? "echec" : "identite");
  }

  if (etape === "identite") return <EtapeIdentite onDone={() => setEtape("mot_de_passe")} />;

  if (etape === "mot_de_passe" && client) {
    return (
      <SupabasePasswordForm client={client} onDone={() => window.location.replace("/espace")} />
    );
  }

  const lienIncomplet = !invitation && (!tokenHash || !type);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="w-full space-y-3">
        {etape === "echec" || lienIncomplet ? (
          <>
            <h1 className="text-xl font-semibold">Ce lien n'est plus valable</h1>
            <p className="text-sm text-muted-foreground">
              Il a expiré ou a été remplacé par un envoi plus récent. Recevez-en un nouveau
              ci-dessous : il sera valable 7 jours.
            </p>
            <NouveauLien />
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => window.location.replace("/espace")}
            >
              J'ai déjà un mot de passe : me connecter
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

/**
 * LE LIBRE-SERVICE (21/09). La réponse est la même que l'adresse soit connue ou
 * non : la page ne doit pas servir à savoir qui est inscrit.
 */
function NouveauLien() {
  const client = getBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye">("saisie");

  async function envoyer() {
    if (!client || !email.includes("@")) return;
    setEtat("envoi");
    await client.functions
      .invoke("request-new-link", { body: { email: email.trim() } })
      .catch(() => undefined);
    setEtat("envoye");
  }

  if (etat === "envoye") {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm">
        Si cette adresse est inscrite, un nouveau lien vient de lui être envoyé. Pensez à regarder
        les courriers indésirables.
      </p>
    );
  }
  return (
    <form
      className="space-y-2 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void envoyer();
      }}
    >
      <Label htmlFor="nouveau-lien-email">Votre adresse e-mail</Label>
      <Input
        id="nouveau-lien-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="min-h-11"
      />
      <Button type="submit" className="min-h-11 w-full" disabled={etat === "envoi"}>
        {etat === "envoi" ? "Envoi…" : "Recevoir un nouveau lien"}
      </Button>
    </form>
  );
}
