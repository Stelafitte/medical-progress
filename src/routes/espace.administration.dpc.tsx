import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { DpcImplementationsSection } from "@/features/administration/DpcImplementationsSection";
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
        title="Programmes DPC importés et implémentations"
        description="Module optionnel activable par programme : audits avant/après, formation, tests et attestation."
      />
      <div className="space-y-2">
        <Button asChild className="min-h-11 w-full sm:w-auto">
          <Link to="/espace/administration/assistant-dpc">
            Importer et implémenter un programme DPC
          </Link>
        </Button>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Importez le programme DPC et ses documents associés. Campus Santé Augmenté prépare une
          implémentation structurée que vous pourrez vérifier, planifier et ouvrir pour une
          cohorte.
        </p>
        <Button asChild variant="ghost" className="min-h-11 w-full sm:w-auto">
          <Link to="/espace/administration/assistant-dpc">
            Réutiliser un programme déjà importé (option secondaire)
          </Link>
        </Button>
      </div>
      <DpcImplementationsSection />
      <DpcProgrammeSection />
    </div>
  );
}
