/**
 * Ancien hub « Conception du programme » — ses contenus vivent désormais dans
 * les onglets Base de connaissances, Compétences et Évaluations.
 * L'URL est conservée en redirection vers le concepteur de programme.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration/pedagogie")({
  beforeLoad: () => {
    throw redirect({ to: "/espace/administration/concepteur", replace: true });
  },
});
