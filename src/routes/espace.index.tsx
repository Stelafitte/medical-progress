import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { landingRouteFor, navSpacesFor } from "@/components/layout/navigation";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { DashboardView } from "@/features/dashboard/DashboardView";

/**
 * ⚠️ `/espace` EST LA PORTE D'ENTRÉE, PAS UNE PAGE COMME UNE AUTRE.
 *
 * Elle affichait « Accès restreint — le tableau de bord apprenant est réservé »
 * à qui n'est pas apprenant. C'est ce mur que Stef voyait APRÈS CHAQUE
 * CONNEXION (16/09) : c'est l'adresse qu'ouvre le favori, et un administrateur
 * ou un encadrant n'y a, par construction, jamais droit. Le rôle actif n'y peut
 * rien — aucun de ses rôles ne donne accès au tableau de bord d'un étudiant.
 *
 * On ne refuse donc plus : on CONDUIT. La première page réellement accessible
 * avec le rôle actif remplace l'écran, sans laisser de trace dans l'historique
 * (`replace`) — sinon le bouton « Précédent » ramènerait sur le mur.
 */
function EspaceIndexRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  const navigate = useNavigate();
  const estApprenant = canAccessLearnerSpace(rolesForAccess, activeProgram.id);
  const premierePage = landingRouteFor(
    navSpacesFor(rolesForAccess, activeProgram.id, activeProgram.config, activeProgram.code),
  );

  useEffect(() => {
    if (estApprenant) return;
    /* Garde-fou : jamais de redirection de « /espace » vers « /espace ». */
    if (premierePage === "/espace") return;
    void navigate({ to: premierePage, replace: true });
  }, [estApprenant, navigate, premierePage]);

  if (!estApprenant) {
    return <p className="text-muted-foreground p-6 text-sm">Ouverture de votre espace…</p>;
  }
  return <DashboardView />;
}

export const Route = createFileRoute("/espace/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Aujourd'hui, cette semaine, jalons, progression et stage : le pilotage quotidien de l'apprenant.",
      },
      { property: "og:title", content: "Tableau de bord apprenant — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Aujourd'hui, cette semaine, jalons, progression et stage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EspaceIndexRoute,
});
