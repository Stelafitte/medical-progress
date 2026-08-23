/**
 * Ancien cockpit « Pilotage de la promotion » — remplacé par l'onglet
 * Pilotage de programme et ses outils dépliables.
 * L'URL est conservée en redirection.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration/suivi")({
  beforeLoad: () => {
    throw redirect({ to: "/espace/administration/pilotage", replace: true });
  },
});
