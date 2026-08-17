import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionMessages } from "@/features/supervision/SupervisionMessages";

export const Route = createFileRoute("/espace/encadrement/messages")({
  head: () => ({
    meta: [
      { title: "Messagerie d'encadrement — Mon Passeport Éducatif" },
      { name: "description", content: "Échanges simulés avec les étudiants encadrés et l'administration du programme." },
      { property: "og:title", content: "Messagerie d'encadrement — Mon Passeport Éducatif" },
      { property: "og:description", content: "Échanges simulés avec les étudiants encadrés et l'administration du programme." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessSupervision) return <AccessRestricted area="L'espace responsable de stage" />;
  return <SupervisionMessages />;
}
