import { Badge } from "@/components/ui/badge";
import { MASTERY_LABELS_FR, NATURE_LABELS_FR } from "@/domain/mastery";
import type { MasteryLevel, OutcomeNature } from "@/domain/types";
import { cn } from "@/lib/utils";

const MASTERY_CLASS: Record<MasteryLevel, string> = {
  not_started: "bg-muted text-muted-foreground",
  novice: "bg-secondary text-secondary-foreground",
  intermediate: "bg-accent text-accent-foreground",
  proficient: "bg-primary text-primary-foreground",
  autonomous: "bg-success text-success-foreground",
};

export function MasteryBadge({ level, className }: { level: MasteryLevel; className?: string }) {
  return (
    <Badge className={cn("border-transparent", MASTERY_CLASS[level], className)}>
      {MASTERY_LABELS_FR[level]}
    </Badge>
  );
}

export function NatureBadge({ nature }: { nature: OutcomeNature }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {NATURE_LABELS_FR[nature]}
    </Badge>
  );
}
