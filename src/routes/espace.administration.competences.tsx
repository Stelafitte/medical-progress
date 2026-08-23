import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminCompetencies } from "@/features/administration/AdminCompetencies";

export const Route = createFileRoute("/espace/administration/competences")({
  head: () => ({
    meta: [
      { title: "Compétences — Campus Santé Augmenté" },
      { name: "description", content: "Savoir-faire de stage et de simulation, référentiel et suivi d'acquisition." },
      { property: "og:title", content: "Compétences — Campus Santé Augmenté" },
      { property: "og:description", content: "Savoir-faire de stage et de simulation, référentiel et suivi d'acquisition." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="L'administration du programme" />;
  return <AdminCompetencies />;
}
