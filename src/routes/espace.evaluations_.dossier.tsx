import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { CasPlayer, type CasPlayerParams } from "@/features/evaluations/CasPlayer";

function DossierRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  const params = Route.useSearch();
  if (!canAccessLearnerSpace(rolesForAccess, activeProgram.id)) {
    return <AccessRestricted area="Mes évaluations" />;
  }
  return <CasPlayer params={params} />;
}

/**
 * LE LECTEUR DE DOSSIER EST UNE ROUTE SOUS « MES ÉVALUATIONS », comme le QCM.
 *
 * L'URL porte le dossier, et RIEN D'AUTRE : ni l'étape en cours, ni les
 * réponses. Un dossier progressif ne se reprend pas au milieu — si l'étudiant
 * recharge, il recommence, et c'est cohérent avec la règle du non-retour.
 * Porter l'étape dans l'URL en ferait un signet, donc une façon de sauter les
 * questions gênantes.
 */
export const Route = createFileRoute("/espace/evaluations_/dossier")({
  validateSearch: (search: Record<string, unknown>): CasPlayerParams => ({
    caseId: typeof search["caseId"] === "string" ? (search["caseId"] as string) : "",
  }),
  component: DossierRoute,
});
