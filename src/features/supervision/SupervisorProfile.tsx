import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useSupervision } from "@/features/supervision/useSupervision";
import { useSession } from "@/application/session";
import { ROLE_LABELS_FR } from "@/domain/roles";

const NOTIFICATION_PREFS: readonly { key: string; label: string; enabled: boolean }[] = [
  { key: "new_log", label: "Nouveau carnet soumis", enabled: true },
  { key: "late", label: "Validation en retard", enabled: true },
  { key: "low_activity", label: "Faible activité d'un étudiant", enabled: false },
  { key: "end_of_placement", label: "Bilan de fin de stage à préparer", enabled: true },
];

export function SupervisorProfile() {
  const { person, rolesInActiveProgram, activeProgram } = useSession();
  const { data, isPending } = useSupervision();

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Mon profil d'encadrant"
        level={1}
        action={<MockBadge />}
        description="Fonction, terrains, périodes d'encadrement et préférences de notification."
      />

      <ScopeNotice>
        Ces informations décrivent votre périmètre d'encadrement. Elles ne donnent aucun accès aux
        autres étudiants du programme.
      </ScopeNotice>

      <PanelCard title={person.fullName} description={person.email}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Fonction</dt>
            <dd>
              {rolesInActiveProgram.map((r) => ROLE_LABELS_FR[r]).join(" · ") || "Aucun rôle"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Programme</dt>
            <dd>
              {activeProgram.name}{" "}
              <Badge variant="outline" className="font-mono text-[10px]">
                {activeProgram.code}
              </Badge>
            </dd>
          </div>
        </dl>
      </PanelCard>

      <PanelCard title="Terrains et périodes d'encadrement">
        <ul className="space-y-2">
          {data.assignments.map((a) => {
            const placement = data.placements.find((p) => p.id === a.placementId);
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{placement?.name ?? "Stage"}</span>
                <span className="text-sm text-muted-foreground">
                  {placement?.site} · {new Date(a.startsOn).toLocaleDateString("fr-FR")} —{" "}
                  {new Date(a.endsOn).toLocaleDateString("fr-FR")}
                </span>
              </li>
            );
          })}
          {data.assignments.length === 0 ? (
            <li className="text-sm text-muted-foreground">Aucun terrain dans ce programme.</li>
          ) : null}
        </ul>
      </PanelCard>

      <PanelCard
        title="Préférences de notification"
        description="Démonstration — non enregistré, aucune notification réelle."
      >
        <ul className="space-y-3">
          {NOTIFICATION_PREFS.map((pref) => (
            <li key={pref.key} className="flex items-center justify-between gap-3">
              <label htmlFor={`pref-${pref.key}`} className="text-sm">
                {pref.label}
              </label>
              <Switch id={`pref-${pref.key}`} defaultChecked={pref.enabled} />
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
