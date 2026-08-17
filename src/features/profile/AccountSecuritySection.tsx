import { KeyRound, Lock, MonitorSmartphone, ShieldCheck, MailQuestion } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const UNAVAILABLE = "Disponible après activation du compte";

/**
 * Structure de la sécurité du compte, volontairement INACTIVE :
 * aucune saisie de mot de passe, aucun secret, aucun stockage local,
 * aucune activation 2FA simulée. Les actions sont désactivées et étiquetées.
 */
const ITEMS: ReadonlyArray<{
  id: string;
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  action: string;
}> = [
  {
    id: "securite-2fa",
    icon: ShieldCheck,
    title: "Authentification à deux facteurs",
    description:
      "Second facteur prévu (application d'authentification ou clé). Aucun facteur n'est configurable tant que le backend d'authentification n'est pas actif.",
    action: "Configurer la double authentification",
  },
  {
    id: "securite-mdp",
    icon: KeyRound,
    title: "Changement de mot de passe",
    description:
      "Le changement se fera exclusivement côté serveur authentifié. Aucun champ de mot de passe n'est proposé dans cette itération.",
    action: "Changer mon mot de passe",
  },
  {
    id: "securite-recuperation",
    icon: MailQuestion,
    title: "Mot de passe oublié et récupération",
    description:
      "Récupération par e-mail vérifié, avec lien à durée limitée. Procédure non branchée à ce stade.",
    action: "Lancer une récupération",
  },
  {
    id: "securite-sessions",
    icon: MonitorSmartphone,
    title: "Sessions actives et révocation",
    description:
      "La liste des appareils connectés et la révocation ciblée nécessitent des sessions serveur réelles : rien n'est affiché ici pour ne pas simuler une opération de sécurité.",
    action: "Révoquer les autres sessions",
  },
];

export function AccountSecuritySection() {
  return (
    <section aria-labelledby="titre-securite">
      <SectionHeading
        id="titre-securite"
        title="Sécurité du compte"
        description="Périmètre prévu et non actif : aucune opération de sécurité n'est réellement effectuée dans cette itération."
        action={<Badge variant="outline">Non actif</Badge>}
      />
      <ul className="grid gap-4 md:grid-cols-2">
        {ITEMS.map(({ id, icon: Icon, title, description, action }) => (
          <li key={id}>
            <Card>
              <CardHeader>
                <Icon className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  aria-describedby={`${id}-etat`}
                  className="w-full justify-start"
                >
                  <Lock className="size-4" aria-hidden />
                  {action}
                </Button>
                <p id={`${id}-etat`} className="mt-2 text-xs text-muted-foreground">
                  {UNAVAILABLE}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
