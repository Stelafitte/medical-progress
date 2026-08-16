import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, FlaskConical } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IS_DEV } from "@/lib/env";

type ModuleState = "en_place" | "simule" | "prevu";

interface ModuleRow {
  readonly name: string;
  readonly state: ModuleState;
  readonly note: string;
}

const MODULES: readonly ModuleRow[] = [
  { name: "Modèle de domaine (14 entités)", state: "en_place", note: "src/domain/types.ts" },
  {
    name: "Calcul de maîtrise déterministe",
    state: "en_place",
    note: "src/domain/mastery.ts — aucune IA",
  },
  {
    name: "Ports d'accès aux données",
    state: "en_place",
    note: "src/application/ports/repositories.ts",
  },
  {
    name: "Persistance (base de données)",
    state: "prevu",
    note: "Aucune base activée, aucune migration. Schéma à valider avant provisioning.",
  },
  {
    name: "Schéma PostgreSQL & matrice RLS",
    state: "prevu",
    note: "docs/database/draft/ — conception non exécutée (schéma, policies, matrice, tests, décisions)",
  },
  { name: "Repositories mock en mémoire", state: "simule", note: "src/infrastructure/mock/*" },
  {
    name: "Authentification & session",
    state: "simule",
    note: "src/application/session.tsx — personne et rôles figés",
  },
  {
    name: "Rôles contextualisés (programme / cohorte / stage)",
    state: "en_place",
    note: "RoleAssignment.scope",
  },
  { name: "RLS, quotas, audit des endpoints", state: "prevu", note: "Après provisioning" },
  {
    name: "Assistance IA",
    state: "prevu",
    note: "Aucun appel IA réel dans cette itération",
  },
  {
    name: "Moteur ECOS / simulation",
    state: "prevu",
    note: "Représenté comme nature d'acquis + type de preuve uniquement",
  },
  {
    name: "Import sélectif de l'historique",
    state: "prevu",
    note: "LegacyMigrationAdapter + champ Provenance déjà présents",
  },
  { name: "Structure de tests", state: "en_place", note: "vitest — src/**/__tests__" },
  {
    name: "Vues métier par domaine fonctionnel",
    state: "en_place",
    note: "src/features/{dashboard,passport,stage,resources,administration,architecture}",
  },
  {
    name: "Catalogue de ressources et saisie de gestes",
    state: "simule",
    note: "Lecture des contenus et contre-signature à implémenter",
  },
];

const STATE_META: Record<ModuleState, { label: string; icon: typeof CheckCircle2 }> = {
  en_place: { label: "En place", icon: CheckCircle2 },
  simule: { label: "Simulé", icon: FlaskConical },
  prevu: { label: "Prévu", icon: CircleDashed },
};

export function ArchitectureView() {
  if (!IS_DEV) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page réservée au développement</CardTitle>
          <CardDescription>
            Cette vue n'est pas disponible en production.{" "}
            <Link to="/espace" className="underline">
              Retour au tableau de bord
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Architecture / état du socle"
        level={1}
        description="Monolithe modulaire : UI, logique métier, accès aux données et intégrations sont séparés. Cette page liste explicitement ce qui est réel et ce qui est encore simulé."
      />

      <ul className="grid gap-3 md:grid-cols-2">
        {MODULES.map((module) => {
          const meta = STATE_META[module.state];
          const Icon = meta.icon;
          return (
            <li key={module.name} className="surface-panel p-4">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">{module.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{module.note}</p>
                </div>
                <Badge variant="outline" className="ms-auto shrink-0 text-xs">
                  {meta.label}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limites assumées de l'itération 1</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Aucune donnée persistée : tout redevient l'état initial au rechargement.</p>
          <p>Aucun couplage avec les tables ou APIs d'un système existant.</p>
          <p>Aucun secret côté client, aucun appel réseau sortant.</p>
        </CardContent>
      </Card>
    </div>
  );
}
