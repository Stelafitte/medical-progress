import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SupervisionStudents } from "@/features/supervision/SupervisionStudents";

export const Route = createFileRoute("/espace/encadrement/etudiants")({
  head: () => ({
    meta: [
      { title: "Mes étudiants — Mon Passeport Éducatif" },
      { name: "description", content: "Liste filtrable des étudiants encadrés et fiche synthétique de progression." },
      { property: "og:title", content: "Mes étudiants — Mon Passeport Éducatif" },
      { property: "og:description", content: "Liste filtrable des étudiants encadrés et fiche synthétique de progression." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

/** Garde d'accès dérivée des RoleAssignment contextualisés du programme actif. */
function Guarded() {
  const session = useSession();
  if (!session.canAccessSupervision) return <AccessRestricted area="L'espace responsable de stage" />;
  return <SupervisionStudents />;
}
