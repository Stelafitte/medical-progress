import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { AdminMessagerie } from "@/features/administration/AdminMessagerie";

/** Messagerie du programme, vue de l'administration (21/09). */
export const Route = createFileRoute("/espace/administration/messagerie")({
  head: () => ({
    meta: [
      { title: "Messagerie du programme — Campus Santé Augmenté" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

function Guarded() {
  const { canAccessProgramAdministration } = useSession();
  if (!canAccessProgramAdministration)
    return <AccessRestricted area="La messagerie du programme" />;
  return <AdminMessagerie />;
}
