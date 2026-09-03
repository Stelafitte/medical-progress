import { useEffect, useState, type ReactNode } from "react";

import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";
import { SupabasePasswordForm } from "@/components/supabase-password-form";
import { Button } from "@/components/ui/button";

/**
 * Lus AU CHARGEMENT DU MODULE, avant que quoi que ce soit ne monte.
 *
 * POURQUOI PAS SEULEMENT L'ÉVÉNEMENT `PASSWORD_RECOVERY`. Le client Supabase a
 * `detectSessionInUrl: true` : il consomme le fragment `#access_token=…&type=recovery`
 * dès sa création et efface l'URL dans la foulée. L'événement peut donc être émis
 * AVANT que le moindre écouteur React ne soit posé. Constaté le 03/09 : l'apprenant
 * arrivait sur la page d'accueil, session ouverte, sans jamais avoir posé de mot de
 * passe — et redemandait un lien indéfiniment.
 *
 * POURQUOI À LA RACINE ET PAS DANS LE FOURNISSEUR DE SESSION. Le lien renvoie sur
 * l'URL de site configurée dans Supabase, c'est-à-dire la page d'accueil PUBLIQUE —
 * hors de `SessionProvider`, monté sous `/espace` seulement.
 */
const HASH = typeof window !== "undefined" ? window.location.hash + window.location.search : "";
const RECOVERY_DANS_URL = HASH.includes("type=recovery");
const LIEN_REFUSE = HASH.includes("error_code=") || HASH.includes("error=access_denied");

type Phase = "verification" | "formulaire" | "lien_perime" | "aucun";

/**
 * Intercepte l'arrivée par lien de première connexion et impose la définition d'un
 * mot de passe — mais SEULEMENT si une session existe réellement derrière.
 *
 * LE DÉFAUT CORRIGÉ LE 03/09 : la première version se fiait à la seule présence de
 * `type=recovery` dans l'adresse. Un lien périmé, ou simplement une adresse rappelée
 * par l'historique, affichait alors un formulaire incapable d'enregistrer quoi que
 * ce soit — `updateUser` échouant sur « Auth session missing ». Un écran qui promet
 * une action qu'il ne peut pas tenir est pire qu'un écran absent.
 */
export function PasswordRecoveryGate({ children }: { children: ReactNode }) {
  const client = getBrowserSupabaseClient();
  const [phase, setPhase] = useState<Phase>(() => {
    if (LIEN_REFUSE) return "lien_perime";
    return RECOVERY_DANS_URL ? "verification" : "aucun";
  });

  useEffect(() => {
    if (!client) return;
    // La session est le seul juge : le fragment d'URL ne prouve rien.
    if (phase === "verification") {
      void client.auth.getSession().then(({ data }) => {
        setPhase(data.session ? "formulaire" : "lien_perime");
      });
    }
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPhase("formulaire");
    });
    return () => data.subscription.unsubscribe();
  }, [client, phase]);

  if (phase === "verification") {
    return <p className="p-6 text-sm text-muted-foreground">Vérification du lien…</p>;
  }

  if (phase === "lien_perime") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Ce lien n'est plus valable</h1>
          <p className="text-sm text-muted-foreground">
            Un lien de connexion ne sert qu'une seule fois, et il expire au bout d'une heure.
            Demandez-en un nouveau à l'équipe pédagogique, ou connectez-vous si vous avez déjà un
            mot de passe.
          </p>
          <Button
            className="min-h-11"
            onClick={() => {
              // On efface le fragment : sans cela, un simple rechargement
              // ramenerait indefiniment cet ecran.
              window.location.replace(window.location.pathname);
            }}
          >
            Aller à la connexion
          </Button>
        </div>
      </main>
    );
  }

  if (phase === "formulaire" && client) {
    return <SupabasePasswordForm client={client} onDone={() => setPhase("aucun")} />;
  }
  return <>{children}</>;
}
