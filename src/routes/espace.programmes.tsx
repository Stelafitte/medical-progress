import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AllProgramsView } from "@/features/administration/AllProgramsView";

export const Route = createFileRoute("/espace/programmes")({
  head: () => ({
    meta: [
      { title: "Tous les programmes — Campus Santé Augmenté" },
      { name: "description", content: "Vue d'ensemble des programmes administrés et de leur classe active." },
      { property: "og:title", content: "Tous les programmes — Campus Santé Augmenté" },
      { property: "og:description", content: "Vue d'ensemble des programmes administrés et de leur classe active." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessAdministration)
    return <AccessRestricted area="La vue de tous les programmes" />;
  return <AllProgramsView />;
}
