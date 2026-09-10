import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminEncadrementSync } from "@/features/administration/AdminEncadrementSync";

function Guarded() {
  const { canAccessProgramAdministration } = useSession();
  if (!canAccessProgramAdministration) {
    return <AccessRestricted area="Mise à jour de l'équipe d'encadrement" />;
  }
  return <AdminEncadrementSync />;
}

export const Route = createFileRoute("/espace/administration/encadrement")({
  head: () => ({
    meta: [
      { title: "Équipe d'encadrement — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Synchronisation de l'équipe d'encadrement d'un service vers le vivier du programme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});
