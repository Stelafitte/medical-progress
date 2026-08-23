/**
 * Ancien hub « Préparation de la promotion » — remplacé par l'onglet Classes
 * d'apprenants, qui ouvre Personnes et inscriptions.
 * L'URL est conservée en redirection.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration/organisation")({
  beforeLoad: () => {
    throw redirect({ to: "/espace/administration/classes", replace: true });
  },
});
