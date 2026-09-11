import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgramId } from "@/domain/types";

/** Option d'ouverture de la vue en blocs des programmes administrés. */
export const ALL_PROGRAMS_VALUE = "__all_programs__";

/**
 * Sélecteur de programme.
 * `full` (menu mobile) occupe toute la largeur ; par défaut, il reste compact
 * pour tenir dans l'en-tête dès 360 px sans débordement.
 */
export function ProgramSwitcher({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const {
    programs,
    activeProgram,
    setActiveProgramId,
    canAccessAdministration,
    canAccessPlatformAdministration,
    roles,
    enrollments,
  } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Tant que la vue « Tous les programmes » est ouverte, le sélecteur reste sur
  // cette option : aucun programme n'est le périmètre courant.
  const isAllPrograms =
    pathname.startsWith("/espace/programmes") || pathname.startsWith("/espace/plateforme");

  // Un rôle de portée plateforme donne accès à tous les programmes ; sinon, seuls
  // les programmes où la personne a un rôle ou une inscription sont sélectionnables.
  const selectableProgramIds = new Set<string>([
    ...roles.flatMap((role) => ("programId" in role.scope ? [role.scope.programId] : [])),
    ...enrollments.map((enrollment) => enrollment.programId),
    activeProgram.id,
  ]);
  const visiblePrograms = canAccessPlatformAdministration
    ? programs
    : programs.filter((program) => selectableProgramIds.has(program.id));

  return (
    <div className={variant === "full" ? "w-full" : "flex min-w-0 items-center gap-2"}>
      <label htmlFor={`program-switcher-${variant}`} className="sr-only">
        Programme actif
      </label>
      <Select
        value={isAllPrograms ? ALL_PROGRAMS_VALUE : activeProgram.id}
        onValueChange={(value) => {
          if (value === ALL_PROGRAMS_VALUE) {
            void navigate({
              to: canAccessPlatformAdministration
                ? "/espace/plateforme/programmes"
                : "/espace/programmes",
            });
            return;
          }
          setActiveProgramId(value as ProgramId);
          if (isAllPrograms) void navigate({ to: "/espace/administration" });
        }}
      >
        <SelectTrigger
          id={`program-switcher-${variant}`}
          className={
            variant === "full"
              ? "min-h-11 w-full bg-card"
              : "min-h-10 w-[7.5rem] min-w-0 bg-card sm:w-[15rem]"
          }
        >
          <SelectValue placeholder="Choisir un programme" />
        </SelectTrigger>
        <SelectContent>
          {canAccessAdministration ? (
            <SelectItem value={ALL_PROGRAMS_VALUE}>
              <span className="sm:hidden">Tous</span>
              <span className="hidden sm:inline">Tous les programmes</span>
            </SelectItem>
          ) : null}
          {visiblePrograms.map((program) => (
            <SelectItem key={program.id} value={program.id}>
              <span className="sm:hidden">{program.code}</span>
              <span className="hidden sm:inline">{program.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
