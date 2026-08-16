import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdministrationView } from "@/features/administration/AdministrationView";

export const Route = createFileRoute("/espace/administration")({
  head: () => ({
    meta: [
      { title: "Administration des programmes — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Vue administrative minimale : programmes, versions de référentiel et cohortes du socle multi-programmes.",
      },
      { property: "og:title", content: "Administration — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Programmes, référentiels et cohortes gérés par un moteur commun configurable.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuardedAdministration,
});

/**
 * Garde d'accès : la décision vient des RoleAssignment du contexte de session
 * (programme sélectionné), jamais d'un booléen local.
 */
function GuardedAdministration() {
  const { canAccessAdministration } = useSession();
  if (!canAccessAdministration)
    return <AccessRestricted area="L'administration institutionnelle" />;
  return <AdministrationView />;
}
