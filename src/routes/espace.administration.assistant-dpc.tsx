import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { DpcProgramWizard } from "@/features/administration/DpcProgramWizard";

export const Route = createFileRoute("/espace/administration/assistant-dpc")({
  head: () => ({
    meta: [
      { title: "Importer et implémenter un programme DPC — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Assistant simulé : import du programme DPC au format Word ou PDF et de ses documents associés, vérification de l'analyse proposée, des modules et des règles, programmation de l'implémentation et contrôle final.",
      },
      {
        property: "og:title",
        content: "Importer et implémenter un programme DPC — Campus Santé Augmenté",
      },
      {
        property: "og:description",
        content:
          "Maquette locale : import documentaire simulé, implémentation structurée à vérifier, aucune ouverture réelle.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Guarded,
});

function Guarded() {
  const session = useSession();
  if (!session.canAccessProgramAdministration)
    return <AccessRestricted area="L'assistant d'implémentation d'un DPC" />;
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Importer et implémenter un programme DPC"
        description="Importez le programme DPC et ses documents associés. Campus Santé Augmenté prépare une implémentation structurée que vous pourrez vérifier, planifier et ouvrir pour une cohorte. Aucun fichier transmis, aucune analyse réelle, aucune ouverture réelle."
      />
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/espace/administration/dpc">Revenir aux programmes DPC</Link>
      </Button>
      <DpcProgramWizard />
    </div>
  );
}
