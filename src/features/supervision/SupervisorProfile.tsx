import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useSupervision } from "@/features/supervision/useSupervision";
import { useSession } from "@/application/session";
import { ROLE_LABELS_FR } from "@/domain/roles";
import { AccountCredentialsSection } from "@/features/profile/AccountCredentialsSection";

/*
 * ⚠️ LE BLOC « PREFERENCES DE NOTIFICATION » A ETE RETIRE LE 11/09.
 *
 * Il affichait quatre interrupteurs tirés d'une constante en dur, qui
 * n'enregistraient rien et ne commandaient aucune notification — la carte le
 * disait elle-même en petit : « Démonstration — non enregistré ». Un
 * interrupteur qui ne commande rien use la confiance dans ceux qui commandent
 * quelque chose : basculer celui-là apprend à se méfier de tous les autres.
 *
 * QUAND ON LE REBRANCHERA : `communication_preferences` porte déjà le
 * désabonnement par canal (`person_id`, `channel`, `opted_out`) et serait la
 * table naturelle. Il manque le déclencheur — aucune horloge n'est installée,
 * le chantier B de la communication reste ouvert. Reposer l'écran avant le
 * mécanisme reviendrait à remettre la même promesse creuse.
 */

export function SupervisorProfile() {
  const { person, rolesInActiveProgram, activeProgram } = useSession();
  const { data, isPending } = useSupervision();

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Mon profil d'encadrant"
        level={1}
        description="Fonction, terrains et périodes d’encadrement."
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

      <AccountCredentialsSection currentEmail={person.email} />

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
    </div>
  );
}
