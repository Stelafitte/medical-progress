import { useState, type FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabaseClient } from "@/infrastructure/supabase/client";

/**
 * ADRESSE DE CONNEXION ET MOT DE PASSE — reellement branches.
 *
 * CE QUI MANQUAIT (mesure le 10/09). `AccountSecuritySection` decrivait le
 * changement de mot de passe comme « a venir » alors que l'authentification
 * Supabase est reelle depuis plusieurs jours et que `SupabasePasswordForm`
 * fait deja exactement ce geste apres un lien de recuperation. Le seul endroit
 * ou l'on ne pouvait PAS changer son mot de passe etait donc son propre profil.
 *
 * LE MEME COMPOSANT SERT AUX DEUX PROFILS, apprenant et encadrant : ce sont
 * les memes comptes `auth.users`, et dupliquer l'ecran aurait garanti qu'un
 * des deux prenne du retard.
 *
 * L'ADRESSE NE CHANGE PAS TOUT DE SUITE. Supabase envoie un lien de
 * confirmation A LA NOUVELLE ADRESSE (et, selon la configuration du projet, un
 * avertissement a l'ancienne) : tant que le lien n'est pas suivi, la connexion
 * se fait toujours avec l'ancienne. On le dit, plutot que de laisser croire
 * que c'est fait.
 *
 * ⚠️ `people.login_email` N'EST PAS TOUCHE : c'est la table du vivier, qui
 * garde l'adresse par laquelle la personne a ete invitee. Les rapprocher
 * automatiquement ferait qu'un changement d'adresse personnelle reecrirait
 * l'historique d'invitation.
 */
export function AccountCredentialsSection({ currentEmail }: { currentEmail: string }) {
  const client = getBrowserSupabaseClient();

  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<{ kind: "ok" | "ko"; message: string } | null>(null);
  const [emailPending, setEmailPending] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordState, setPasswordState] = useState<{ kind: "ok" | "ko"; message: string } | null>(
    null,
  );
  const [passwordPending, setPasswordPending] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const voulue = email.trim().toLowerCase();
    if (voulue === currentEmail.trim().toLowerCase()) {
      setEmailState({ kind: "ko", message: "C'est déjà votre adresse de connexion." });
      return;
    }
    setEmailPending(true);
    setEmailState(null);
    try {
      const { error } = await client.auth.updateUser({ email: voulue });
      if (error) {
        setEmailState({ kind: "ko", message: error.message });
        return;
      }
      setEmail("");
      setEmailState({
        kind: "ok",
        message: `Un lien de confirmation vient d'être envoyé à ${voulue}. Votre adresse de connexion ne changera qu'une fois ce lien suivi.`,
      });
    } catch (raison) {
      setEmailState({
        kind: "ko",
        message: raison instanceof Error ? raison.message : "Changement impossible.",
      });
    } finally {
      setEmailPending(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    if (password !== confirmation) {
      setPasswordState({ kind: "ko", message: "Les deux mots de passe ne sont pas identiques." });
      return;
    }
    if (password.length < 8) {
      setPasswordState({
        kind: "ko",
        message: "Le mot de passe doit contenir au moins 8 caractères.",
      });
      return;
    }
    setPasswordPending(true);
    setPasswordState(null);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setPasswordState({ kind: "ko", message: error.message });
        return;
      }
      setPassword("");
      setConfirmation("");
      setPasswordState({ kind: "ok", message: "Mot de passe enregistré." });
    } catch (raison) {
      setPasswordState({
        kind: "ko",
        message: raison instanceof Error ? raison.message : "Enregistrement impossible.",
      });
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" aria-hidden />
            Adresse de connexion
          </CardTitle>
          <CardDescription>
            {currentEmail
              ? `Vous vous connectez aujourd'hui avec ${currentEmail}.`
              : "Adresse utilisée pour vous connecter."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {client ? (
            <form className="space-y-3" onSubmit={submitEmail}>
              <div className="space-y-2">
                <Label htmlFor="nouvelle-adresse">Nouvelle adresse</Label>
                <Input
                  id="nouvelle-adresse"
                  name="nouvelle-adresse"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="prenom.nom@chu-bordeaux.fr"
                />
              </div>
              {emailState ? (
                <p
                  role={emailState.kind === "ko" ? "alert" : "status"}
                  className={
                    emailState.kind === "ko"
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {emailState.message}
                </p>
              ) : null}
              <Button type="submit" disabled={emailPending} className="min-h-11">
                {emailPending ? "Envoi…" : "Envoyer le lien de confirmation"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Disponible une fois connecté à la plateforme.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" aria-hidden />
            Mot de passe
          </CardTitle>
          <CardDescription>
            Huit caractères au minimum. Le changement prend effet immédiatement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {client ? (
            <form className="space-y-3" onSubmit={submitPassword}>
              <div className="space-y-2">
                <Label htmlFor="profil-nouveau-mdp">Nouveau mot de passe</Label>
                <Input
                  id="profil-nouveau-mdp"
                  name="profil-nouveau-mdp"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profil-confirmation-mdp">Confirmez le mot de passe</Label>
                <Input
                  id="profil-confirmation-mdp"
                  name="profil-confirmation-mdp"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {passwordState ? (
                <p
                  role={passwordState.kind === "ko" ? "alert" : "status"}
                  className={
                    passwordState.kind === "ko"
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {passwordState.message}
                </p>
              ) : null}
              <Button type="submit" disabled={passwordPending} className="min-h-11">
                {passwordPending ? "Enregistrement…" : "Changer mon mot de passe"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Disponible une fois connecté à la plateforme.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
