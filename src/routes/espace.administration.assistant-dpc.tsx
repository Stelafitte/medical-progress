import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { AccessRestricted } from "@/components/access-restricted";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { DpcProgramWizard } from "@/features/administration/DpcProgramWizard";

export const Route = createFileRoute("/espace/administration/assistant-dpc")({
  head: () => ({
    meta: [
      { title: "Créer un programme DPC — Campus Santé Augmenté" },
      {
        name: "description",
        content:
          "Assistant simulé d'implémentation d'un DPC : documents sources, extraction proposée, configuration des audits, séparation des évaluations, calendrier d'implémentation et contrôle avant publication.",
      },
      { property: "og:title", content: "Créer un programme DPC — Campus Santé Augmenté" },
      {
        property: "og:description",
        content:
          "Maquette locale de configuration d'un programme DPC générique, sans envoi de fichier ni publication réelle.",
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
        title="Créer un programme DPC"
        description="Assistant en cinq étapes, entièrement simulé : aucun fichier transmis, aucune extraction réelle, aucune publication."
      />
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/espace/administration/dpc">Revenir au programme DPC</Link>
      </Button>
      <DpcProgramWizard />
    </div>
  );
}
