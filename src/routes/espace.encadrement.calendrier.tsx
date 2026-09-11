import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionCalendrier } from "@/features/supervision/SupervisionCalendrier";

export const Route = createFileRoute("/espace/encadrement/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier du stage — Campus Santé Augmenté" },
      {
        name: "description",
        content: "Semaines en service et semaines de travail personnel, groupe par groupe.",
      },
      { property: "og:title", content: "Calendrier du stage — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Semaines en service et semaines de travail personnel, groupe par groupe.",
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
  return <SupervisionCalendrier />;
}
