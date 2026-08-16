import { useSession } from "@/app/session";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgramId } from "@/domain/types";

export function ProgramSwitcher() {
  const { programs, activeProgram, setActiveProgramId } = useSession();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="program-switcher" className="sr-only">
        Programme actif
      </label>
      <Select
        value={activeProgram.id}
        onValueChange={(value) => setActiveProgramId(value as ProgramId)}
      >
        <SelectTrigger id="program-switcher" className="w-[15rem] bg-card">
          <SelectValue placeholder="Choisir un programme" />
        </SelectTrigger>
        <SelectContent>
          {programs.map((program) => (
            <SelectItem key={program.id} value={program.id}>
              {program.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
