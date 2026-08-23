/**
 * Ancienne page « Gouvernance du programme » — identique à l'onglet
 * Administration et sécurité, qui en est désormais l'unique point d'entrée.
 * L'URL est conservée en redirection.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/administration/gouvernance")({
  beforeLoad: () => {
    throw redirect({ to: "/espace/administration/securite", replace: true });
  },
});
