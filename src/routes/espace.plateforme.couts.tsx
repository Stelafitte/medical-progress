/**
 * COÛTS D'EXPLOITATION — la route.
 *
 * La garde d'accès est déjà posée par le layout `/espace/plateforme`
 * (`canAccessPlatformAdministration`), et DOUBLÉE côté base : chacune des
 * fonctions appelées ici vérifie `is_platform_admin()`. L'écran ne fait donc
 * pas la sécurité, il la respecte.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OperatingCostsView } from "@/features/administration/OperatingCostsView";

export const Route = createFileRoute("/espace/plateforme/couts")({
  head: () => ({
    meta: [
      { title: "Coûts d'exploitation — Direction plateforme" },
      {
        name: "description",
        content:
          "Coût par programme : IA, stockage, sortie de données et quote-part de plateforme, avec le degré de certitude de chaque poste.",
      },
      { property: "og:title", content: "Coûts d'exploitation — Direction plateforme" },
      {
        property: "og:description",
        content: "Ce que chaque programme consomme, et ce qu'on ne peut que répartir.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperatingCostsView,
});
