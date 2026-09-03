import { useState, type FormEvent } from "react";

import { getSelectedDataAccess } from "@/application/dataAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Correction de SA PROPRE fiche. Un seul champ modifiable aujourd'hui — le nom
 * d'usage — parce que c'est le seul que la table `profiles` porte.
 *
 * LE DEFAUT CORRIGE LE 03/09. Le nom affiche a l'apprenant vient de
 * `profiles.full_name`, ecrit une seule fois a l'activation du compte. Le sas
 * `people`, que le gestionnaire peut editer, ne le met PAS a jour ensuite : le
 * nom avait beau etre corrige dans l'administration, la plateforme continuait
 * d'appeler la personne « Test Apprenant ». Personne, ni elle ni son
 * gestionnaire, n'avait de moyen de reparer ca depuis l'ecran.
 *
 * L'ADRESSE RESTE EN LECTURE SEULE. Elle est dans `auth.users`, pas dans
 * `profiles`, et la changer romprait le lien avec l'invitation deja envoyee et
 * avec l'inscription. Ce sera une operation a part, avec verification de la
 * nouvelle adresse — pas un champ de plus dans ce formulaire.
 *
 * AUCUN IDENTIFIANT N'EST PASSE au port : c'est la session qui designe la
 * personne. Voir `PeopleRepository.updateOwnProfile`.
 */
export function IdentityForm({
  initialFullName,
  email,
  submitLabel,
  onSaved,
}: {
  readonly initialFullName: string;
  readonly email: string;
  readonly submitLabel: string;
  onSaved(fullName: string): void | Promise<void>;
}) {
  const dataAccess = getSelectedDataAccess();
  const [fullName, setFullName] = useState(initialFullName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);

  const inchange = fullName.trim() === initialFullName.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nom = fullName.trim();
    if (nom.length === 0) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    setPending(true);
    setError(null);
    setConfirme(false);
    try {
      const person = await dataAccess.people.updateOwnProfile({ fullName: nom });
      setFullName(person.fullName);
      setConfirme(true);
      await onSaved(person.fullName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="identite-nom">Nom d'usage</Label>
        <Input
          id="identite-nom"
          name="identite-nom"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value);
            setConfirme(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          C'est ce nom qui vous désigne partout sur la plateforme.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="identite-email">Adresse e-mail</Label>
        <Input id="identite-email" type="email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          Lecture seule : c'est votre identifiant de connexion. Sa modification passe par l'équipe
          pédagogique.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {confirme ? (
        <p role="status" className="text-sm text-primary">
          Fiche enregistrée.
        </p>
      ) : null}
      <Button type="submit" disabled={pending || inchange} className="min-h-11">
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
