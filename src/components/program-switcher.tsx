import { useSession } from "@/application/session";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgramId } from "@/domain/types";

/**
 * Sélecteur de programme.
 * `full` (menu mobile) occupe toute la largeur ; par défaut, il reste compact
 * pour tenir dans l'en-tête dès 360 px sans débordement.
 */
export function ProgramSwitcher({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { programs, activeProgram, setActiveProgramId, canAccessPlatformAdministration } =
    useSession();
  const navigate = useNavigate();
  const isPlatformOverview = useRouterState({
    select: (state) => state.location.pathname === "/espace/plateforme",
  });
  const showsAllPrograms = canAccessPlatformAdministration && isPlatformOverview;

  const handleChange = (value: string) => {
    if (value === "all-programs") {
      void navigate({ to: "/espace/plateforme" });
      return;
    }
    setActiveProgramId(value as ProgramId);
    if (isPlatformOverview) {
      void navigate({ to: "/espace/administration" });
    }
  };

  return (
    <div className={variant === "full" ? "w-full" : "flex min-w-0 items-center gap-2"}>
      <label htmlFor={`program-switcher-${variant}`} className="sr-only">
        Programme actif
      </label>
      <Select
        value={showsAllPrograms ? "all-programs" : activeProgram.id}
        onValueChange={handleChange}
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
          {showsAllPrograms ? (
            <SelectItem value="all-programs">
              <span>Tous les programmes</span>
            </SelectItem>
          ) : null}
          {programs.map((program) => (
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
