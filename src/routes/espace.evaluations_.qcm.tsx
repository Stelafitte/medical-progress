import { createFileRoute } from "@tanstack/react-router";
import { AccessRestricted } from "@/components/access-restricted";
import { useSession } from "@/application/session";
import { canAccessLearnerSpace } from "@/domain/access";
import { QcmPlayer, type QcmPlayerParams } from "@/features/evaluations/QcmPlayer";

function QcmRoute() {
  const { rolesForAccess, activeProgram } = useSession();
  const params = Route.useSearch();
  if (!canAccessLearnerSpace(rolesForAccess, activeProgram.id)) {
    return <AccessRestricted area="Mes évaluations" />;
  }
  return <QcmPlayer params={params} />;
}

/**
 * LE JOUEUR EST UNE ROUTE SOUS « MES ÉVALUATIONS », PAS UN ONGLET. L'URL porte
 * la série — une fenêtre (`session`) ou une composition (thèmes, rangs,
 * nombre) — pour qu'un rechargement ne perde pas ce qu'on était en train de
 * faire. Aucune entrée n'est ajoutée à `LEARNER_NAV`.
 */
export const Route = createFileRoute("/espace/evaluations_/qcm")({
  validateSearch: (search: Record<string, unknown>): QcmPlayerParams => {
    const str = (k: string) => (typeof search[k] === "string" && (search[k] as string).length > 0 ? (search[k] as string) : undefined);
    const list = (k: string) => {
      const v = search[k];
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
      if (typeof v === "string" && v.length > 0) return v.split(",");
      return undefined;
    };
    /*
     * Les clés de l'URL sont celles du type : ce que <Link search={…}> écrit
     * est ce que validateSearch relit. Un alias (« modality » pour
     * « modalityId ») aurait laissé passer le typecheck et cassé à l'exécution.
     */
    const count = Number(search["count"]);
    const modalityId = str("modalityId") ?? "";
    const sessionId = str("sessionId");
    const themeIds = list("themeIds");
    const ranks = list("ranks");
    return {
      modalityId,
      ...(sessionId ? { sessionId } : {}),
      ...(themeIds ? { themeIds } : {}),
      ...(ranks ? { ranks } : {}),
      ...(Number.isFinite(count) && count > 0 ? { count: Math.min(100, Math.floor(count)) } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "QCM — Campus Santé Augmenté" },
      { name: "description", content: "Une série de questions corrigée au barème des EDN." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QcmRoute,
});
