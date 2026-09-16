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
  /**
   * Rendu par l'écran qui pose le bandeau : lui seul sait où mène une étape —
   * une section de sa propre page ici, un autre écran ailleurs. Sans lui les
   * quatre puces restent de simples repères, ce qu'elles étaient à l'origine ;
   * mieux vaut une puce inerte qu'une puce qui ne mène nulle part.
   */
  onSelect?: (level: AdminWorkLevel) => void;
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
  onSelect,
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
          const shell = active
            ? "border-primary bg-background shadow-sm"
            : "border-transparent text-muted-foreground";
          const body = (
            <>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs">{item.detail}</span>
            </>
          );
          return (
            <li key={item.id} aria-current={active ? "step" : undefined}>
              {onSelect === undefined ? (
                <div className={`rounded-lg border p-4 ${shell}`}>{body}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`hover:border-primary/60 hover:bg-background min-h-11 w-full rounded-lg border p-4 text-left transition ${shell}`}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
