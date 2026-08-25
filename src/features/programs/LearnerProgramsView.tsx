/**
 * Mes programmes — vue consolidée de l'apprenant, équivalent apprenant du
 * « Tous les programmes » côté administration. Aucune donnée nouvelle : on
 * agrège les inscriptions du compte et les rôles contextualisés.
 */
import { useNavigate } from "@tanstack/react-router";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useSession } from "@/application/session";
import { ROLE_LABELS_FR, rolesInContext } from "@/domain/roles";

const ENROLLMENT_STATUS_FR: Record<string, string> = {
  active: "inscription active",
  suspended: "inscription suspendue",
  completed: "parcours terminé",
  withdrawn: "inscription retirée",
};

export function LearnerProgramsView() {
  const { programs, enrollments, roles, activeProgram, setActiveProgramId } = useSession();
  const navigate = useNavigate();

  const myPrograms = programs.filter((program) =>
    enrollments.some((enrollment) => enrollment.programId === program.id),
  );

  const open = (programId: typeof activeProgram.id) => {
    setActiveProgramId(programId);
    void navigate({ to: "/espace" });
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Mes programmes"
        level={1}
        action={<MockBadge label="Simulé" />}
        description="Vue consolidée de mes parcours : une seule plateforme, plusieurs formations."
      />

      <ScopeNotice>
        Chaque parcours conserve son propre passeport, ses compétences et son calendrier. Ouvrir un
        programme change simplement le périmètre affiché.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Programmes suivis" value={myPrograms.length} />
        <StatCard
          label="Inscriptions actives"
          value={enrollments.filter((e) => e.status === "active").length}
        />
        <StatCard label="Périmètre courant" value={activeProgram.code} />
      </div>

      {myPrograms.length === 0 ? (
        <EmptyState>Aucune inscription rattachée à ce compte.</EmptyState>
      ) : (
        myPrograms.map((program) => {
          const enrollment = enrollments.find((e) => e.programId === program.id);
          const contextRoles = rolesInContext(roles, { programId: program.id });
          return (
            <PanelCard
              key={program.id}
              title={program.name}
              description={`${program.institution} · ${program.code}`}
              action={
                program.id === activeProgram.id ? (
                  <Badge className="font-normal">périmètre courant</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => open(program.id)}>
                    Ouvrir ce programme
                  </Button>
                )
              }
            >
              <p className="text-muted-foreground">
                {enrollment ? ENROLLMENT_STATUS_FR[enrollment.status] : "aucune inscription"} ·{" "}
                {program.config.placementsEnabled
                  ? "carnet de stage activé"
                  : "aucun stage configuré"}
              </p>
              <p className="text-muted-foreground">
                Mes rôles dans ce programme :{" "}
                {contextRoles.map((r) => ROLE_LABELS_FR[r]).join(", ") || "aucun"}
              </p>
            </PanelCard>
          );
        })
      )}
    </div>
  );
}
