import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { SectionHeading } from "@/components/section-heading";
import { DpcProgrammeSection } from "@/features/administration/DpcProgrammeSection";

export const Route = createFileRoute("/espace/administration/dpc")({
  head: () => ({
    meta: [
      { title: "Programme DPC — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Configuration du programme DPC : grille d'audit versionnée, calendrier relatif, participation, conformité et relances.",
      },
      { property: "og:title", content: "Programme DPC — Campus Santé Augmenté" },
      {
        property: "og:description",
        content: "Pilotage du programme intégré : deux tours d'audit, formation et tests.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="L'administration du programme" />;
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Programme DPC"
        description="Module optionnel activable par programme : audits avant/après, formation, tests et attestation."
      />
      <DpcProgrammeSection />
    </div>
  );
}
