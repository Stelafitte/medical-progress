import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Écran de définition du mot de passe, affiché après un lien de première
 * connexion ou de récupération.
 *
 * CE QUI MANQUAIT. Le lien envoyé par Supabase ouvre bien une session — le
 * client a `detectSessionInUrl: true` — mais rien dans l'application ne
 * proposait ensuite de POSER un mot de passe. L'apprenant se retrouvait
 * connecté pour une heure sans le savoir, puis dehors, et redemandait un lien
 * indéfiniment. Mesuré le 03/09 : le mot « recovery » n'apparaissait nulle part
 * dans `src/`. Une invitation sans cet écran ne sert donc à rien.
 *
 * POURQUOI DEUX CHAMPS. Une faute de frappe sur un mot de passe qu'on ne relit
 * pas enferme la personne dehors, et le seul recours serait un nouveau lien.
 * La confirmation coûte trois secondes et évite un aller-retour par courriel.
 *
 * LE MINIMUM DE 8 CARACTÈRES est celui de Supabase par défaut : on le vérifie
 * ici pour rendre l'erreur immédiatement, sans aller-retour réseau, mais c'est
 * bien le serveur qui décide — on n'ajoute aucune règle qu'il ne connaîtrait pas.
 */
export function SupabasePasswordForm({
  client,
  onDone,
}: {
  client: SupabaseClient;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPassword("");
      setConfirmation("");
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="w-full space-y-2">
        <h1 className="text-xl font-semibold">Choisissez votre mot de passe</h1>
        <p className="text-sm text-muted-foreground">
          Votre lien de connexion est valable une seule fois. Définissez un mot de passe pour
          pouvoir revenir quand vous le souhaitez.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmez le mot de passe</Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? "Enregistrement…" : "Enregistrer et continuer"}
          </Button>
        </form>
      </div>
    </main>
  );
}
