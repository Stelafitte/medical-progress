/**
 * Ancien hub « Structure du programme » — remplacé par la séparation
 * Concepteur (modèle réutilisable) / Pilotage (exploitation d'une promotion).
 * L'URL est conservée en redirection permanente pour ne casser aucun signet.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration/structure")({
  beforeLoad: () => {
    throw redirect({ to: "/espace/administration/concepteur", replace: true });
  },
});
