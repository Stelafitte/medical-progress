/**
 * « Utilisateurs et réglages » — ce qui remplace, le 21/09, l'ancien
 * « Pilotage et paramétrage » de la plateforme.
 *
 * POURQUOI. L'audit du 21/09 a trouvé cet onglet presque entièrement simulé :
 * fiches, cadre général, cadre par programme, notifications, délégations,
 * fonctionnalités, exports, intégrations, courriel — tout vivait dans un
 * magasin de session (`platformSettingsStore`), perdu au rechargement. Pire,
 * deux blocs doublaient des réglages RÉELS : les délégations de rôles (la
 * vraie attribution est dans « Administration et sécurité » du programme) et
 * le quota IA (le vrai plafond est dans la Vue d'ensemble du programme).
 *
 * Il reste ce qui est vrai : l'annuaire des personnes par groupe de rôle, lu
 * en base, et un renvoi vers chaque réglage réel. L'ancien écran
 * (`PlatformPilotageView`) est débranché, pas supprimé : il dit à quoi devra
 * ressembler le paramétrage le jour où il aura une table.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  PLATFORM_ROLE_GROUP_LABELS_FR,
  PLATFORM_ROLE_GROUP_ORDER,
  buildPlatformDirectory,
  groupPlatformDirectory,
  type PlatformRoleGroup,
} from "@/domain/platformDirectory";

const REGLAGES_REELS: readonly { label: string; detail: string; to: string }[] = [
  {
    label: "Droits d'accès d'un programme",
    detail: "Accorder ou retirer un rôle (administrateur, responsable de stage, encadrant).",
    to: "/espace/administration/securite",
  },
  {
    label: "Plafond et réglage de l'IA d'un programme",
    detail: "Activation, plafond mensuel par apprenant, consommation du mois.",
    to: "/espace/administration",
  },
  {
    label: "Courriels et annonces",
    detail: "Destinataires et envois réels, par promotion ou par sélection.",
    to: "/espace/administration/communications",
  },
  {
    label: "Coûts d'exploitation",
    detail: "Tarifs unitaires, consommation réelle IA et stockage, relevés de facture.",
    to: "/espace/plateforme/couts",
  },
];

export function PlatformUsersView() {
  const data = useDataAccess();
  const [group, setGroup] = useState<PlatformRoleGroup>("platform_admin");

  const { data: result, isPending } = useQuery({
    queryKey: ["platform-users"],
    queryFn: async () => {
      const [people, roles, programs] = await Promise.all([
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.programs.listPrograms(),
      ]);
      return { people, roles, programs };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const directory = buildPlatformDirectory(result.people, result.roles);
  const grouped = groupPlatformDirectory(directory);
  const visible = grouped[group] ?? [];
  const programName = (id: string) => result.programs.find((p) => p.id === id)?.code ?? id;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Campus Santé Augmenté"
        title="Utilisateurs et réglages"
        level={1}
        description="Qui a un rôle, dans quel programme, et où se règle chaque paramètre réel."
      />

      <ScopeNotice>
        Les réglages de la plateforme se font dans les écrans qui les enregistrent réellement : voir
        « Où se règle quoi », plus bas. Les paramètres qui n'ont pas encore de table en base ne sont
        plus affichés.
      </ScopeNotice>

      <PanelCard
        title="Utilisateurs par groupe de rôle"
        description={`${directory.length} personne(s) disposant d'au moins un rôle.`}
      >
        <div className="flex flex-wrap gap-2">
          {PLATFORM_ROLE_GROUP_ORDER.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={key === group ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setGroup(key)}
            >
              {PLATFORM_ROLE_GROUP_LABELS_FR[key]}
              <Badge variant="secondary" className="ms-2 font-normal">
                {(grouped[key] ?? []).length}
              </Badge>
            </Button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState>Aucune personne dans ce groupe.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personne</TableHead>
                  <TableHead>Courriel</TableHead>
                  <TableHead>Programmes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={`${group}-${row.personId}`}>
                    <TableCell className="font-medium">{row.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.programIds.length > 0
                        ? row.programIds.map(programName).join(" · ")
                        : "plateforme"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelCard>

      <PanelCard
        title="Où se règle quoi"
        description="Chaque lien ouvre l'écran qui enregistre en base."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {REGLAGES_REELS.map((r) => (
            <li key={r.to} className="border-border space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-muted-foreground text-xs">{r.detail}</p>
              <Button asChild size="sm" variant="outline" className="min-h-11">
                <Link to={r.to}>
                  Ouvrir
                  <ArrowRight className="ms-1 size-4" aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
