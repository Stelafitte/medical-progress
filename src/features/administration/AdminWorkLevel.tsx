import { Badge } from "@/components/ui/badge";

export type AdminWorkLevel = "program" | "promotion" | "schedule" | "operations";

const LEVELS: readonly { id: AdminWorkLevel; label: string; detail: string }[] = [
  {
    id: "program",
    label: "1. Concevoir le programme",
    detail: "Modèles, contenus et règles réutilisables",
  },
  {
    id: "promotion",
    label: "2. Préparer la promotion",
    detail: "Inscriptions et affectations",
  },
  {
    id: "schedule",
    label: "3. Programmer le planning général",
    detail: "Dates ou périodes de tous les éléments du programme",
  },
  {
    id: "operations",
    label: "4. Basculer dans le pilotage",
    detail: "Suivi, validations et communications",
  },
];


interface AdminWorkLevelBannerProps {
  level: AdminWorkLevel;
  programName: string;
  cohortCount?: number;
}

/**
 * Repère commun aux écrans d'administration.
 * Il distingue le modèle pédagogique réutilisable de sa mise en œuvre pour une
 * promotion, puis des opérations réalisées pendant cette promotion.
 */
export function AdminWorkLevelBanner({
  level,
  programName,
  cohortCount,
}: AdminWorkLevelBannerProps) {
  return (
    <section
      aria-label="Niveau de travail administratif"
      className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Programme : {programName}</span>
        {cohortCount !== undefined ? (
          <Badge variant="outline" className="bg-background font-normal">
            {cohortCount === 0
              ? "Aucune promotion"
              : `${cohortCount} promotion${cohortCount > 1 ? "s" : ""} dans la maquette`}
          </Badge>
        ) : null}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LEVELS.map((item) => {
          const active = item.id === level;
          return (
            <li
              key={item.id}
              aria-current={active ? "step" : undefined}
              className={
                active
                  ? "rounded-md border border-primary bg-background p-3 shadow-sm"
                  : "rounded-md border border-transparent p-3 text-muted-foreground"
              }
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs">{item.detail}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
