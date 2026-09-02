/**
 * Briques d'interface partagées par les espaces professionnels.
 * Chaque écran indique explicitement ce qui est réel, mocké ou prévu.
 */
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MockBadge({ label = "Maquette" }: { label?: string }) {
  return (
    <Badge variant="outline" className="font-normal">
      {label}
    </Badge>
  );
}

/** Bandeau de périmètre : rappelle ce que le rôle peut voir et ne peut pas voir. */
export function ScopeNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function PanelCard({
  id,
  title,
  description,
  action,
  children,
}: {
  /**
   * Ancre de navigation, posee seulement par les ecrans dont le sommaire
   * renvoie a leurs propres sections. Le panneau devient alors la cible du
   * defilement, et `tabIndex` fait suivre le focus : sans lui la navigation
   * n'existerait qu'a l'oeil, pas au clavier ni au lecteur d'ecran.
   */
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      className={id === undefined ? undefined : "scroll-mt-20"}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}
