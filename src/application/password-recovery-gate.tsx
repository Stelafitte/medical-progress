import { useEffect, useState, type ReactNode } from "react";

import { getSelectedDataAccess } from "@/application/dataAccess";
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";
import { SupabasePasswordForm } from "@/components/supabase-password-form";
import { Button } from "@/components/ui/button";
import { IdentityForm } from "@/features/profile/IdentityForm";
import type { Person, PersonId } from "@/domain/types";

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
 * hors de `SessionProvider`, monté sous `/espace` seulement. La fiche est donc
 * relue ici directement par le port `people`, sans passer par la session.
 */
const HASH = typeof window !== "undefined" ? window.location.hash + window.location.search : "";
const RECOVERY_DANS_URL = HASH.includes("type=recovery");
const LIEN_REFUSE = HASH.includes("error_code=") || HASH.includes("error=access_denied");

/**
 * Deux étapes, dans cet ordre, parce que c'est celui de la demande du 03/09 :
 * « permet à l'apprenant de vérifier ses données et surtout de mettre un MDP ».
 * L'identité d'abord — c'est le moment où la personne est attentive et où le nom
 * qu'on lui a attribué à l'inscription lui saute aux yeux ; le mot de passe
 * ensuite, parce que c'est lui qui referme la porte derrière elle.
 */
type Phase = "verification" | "identite" | "mot_de_passe" | "lien_perime" | "aucun";

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
        setPhase(data.session ? "identite" : "lien_perime");
      });
    }
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;
      // Ne jamais ramener en arrière quelqu'un déjà engagé dans le parcours :
      // `updateUser` ré-émet des événements, et l'écran sauterait sur place.
      setPhase((courante) =>
        courante === "aucun" || courante === "verification" ? "identite" : courante,
      );
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

  if (phase === "identite") {
    return <EtapeIdentite onDone={() => setPhase("mot_de_passe")} />;
  }

  if (phase === "mot_de_passe" && client) {
    return <SupabasePasswordForm client={client} onDone={() => setPhase("aucun")} />;
  }
  return <>{children}</>;
}

/**
 * Première étape : « voici ce qu'on a de vous, corrigez si besoin ».
 *
 * ON N'IMPOSE RIEN. Le bouton « Ces informations sont correctes » passe à la
 * suite sans écrire : la plupart des fiches sont justes, et bloquer la première
 * connexion derrière une modification obligatoire ferait taper n'importe quoi.
 * Enregistrer avance aussi — la personne n'a pas à valider deux fois.
 */
function EtapeIdentite({ onDone }: { onDone: () => void }) {
  const client = getBrowserSupabaseClient();
  const dataAccess = getSelectedDataAccess();
  const [fiche, setFiche] = useState<Person | null>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    if (!client) return;
    let vivant = true;
    void (async () => {
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) throw new Error("Session absente.");
        const person = await dataAccess.people.getPerson(user.id as PersonId);
        if (!vivant) return;
        if (person) setFiche(person);
        else setEchec(true);
      } catch {
        if (vivant) setEchec(true);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [client, dataAccess]);

  // La fiche est un confort, pas un péage : si on n'arrive pas à la lire, on
  // n'enferme personne dehors — on passe directement au mot de passe.
  useEffect(() => {
    if (echec) onDone();
  }, [echec, onDone]);

  if (!fiche) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement de votre fiche…</p>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="w-full space-y-2">
        <h1 className="text-xl font-semibold">Vérifiez vos informations</h1>
        <p className="text-sm text-muted-foreground">
          Voici ce que nous avons de vous. Corrigez si besoin — vous pourrez y revenir à tout moment
          depuis Mon profil. Vous choisirez votre mot de passe à l'étape suivante.
        </p>
        <div className="mt-6">
          <IdentityForm
            initialFullName={fiche.fullName}
            email={fiche.email}
            submitLabel="Enregistrer et continuer"
            onSaved={onDone}
          />
        </div>
        <Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={onDone}>
          Ces informations sont correctes
        </Button>
      </div>
    </main>
  );
}
