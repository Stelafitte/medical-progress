import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionConnaissances } from "@/features/supervision/SupervisionConnaissances";

export const Route = createFileRoute("/espace/encadrement/connaissances")({
  head: () => ({
    meta: [
      { title: "Connaissances — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Le contenu servi aux étudiants, et le suivi des connaissances de la promotion.",
      },
      { property: "og:title", content: "Connaissances — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Le contenu servi aux étudiants, et le suivi des connaissances de la promotion.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessSupervision)
    return <AccessRestricted area="L'espace responsable de stage" />;
  return <SupervisionConnaissances />;
}
