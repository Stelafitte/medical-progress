/**
 * COÛTS D'EXPLOITATION — réservé aux administrateurs de plateforme.
 *
 * Stef, 16/09 au soir : « est-il possible de calculer les coûts d'utilisation
 * pour chaque programme : coût GitHub, coût cloud, coût IA ? »
 *
 * CE QUE CET ÉCRAN REFUSE DE FAIRE, et c'est sa règle de construction :
 * mélanger un euro mesuré et un euro estimé dans la même colonne. Le premier
 * écart avec une vraie facture décrédibiliserait tout le reste. Chaque poste
 * porte donc son DEGRÉ DE CERTITUDE, rendu par la base et pas décidé ici :
 *   mesuré     — jetons IA, octets stockés : comptés exactement par programme ;
 *   estimé     — egress : ouvertures × poids réel du cours ;
 *   réparti    — socle Supabase, Cloudflare, GitHub : au prorata des inscrits.
 *
 * ET UNE PRÉCISION QUI COMPTE (Stef, 17/09) : les clés IA vivent dans le MÊME
 * espace de facturation. Le coût IA par programme est donc un prorata des
 * jetons — exact comme assiette, réparti comme montant. Seul le TOTAL se
 * réconcilie avec la facture, et par construction.
 *
 * GITHUB N'EST PAS UN COÛT D'EXPLOITATION : dépôt unique, coût de fabrication.
 * Il entre dans la quote-part, jamais dans une colonne par programme.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { UnitPricesPanel } from "@/features/administration/UnitPricesPanel";
import {
  COST_BASIS_EXPLANATION_FR,
  COST_BASIS_LABELS_FR,
  formatGo,
  formatJetons,
  formatMontant,
  partParCertitude,
  totalPour,
  type CostBasis,
} from "@/domain/operatingCost";

/** Le mois en cours, du 1er à aujourd'hui — la période qu'on regarde en pratique. */
function moisEnCours(): { debut: string; fin: string } {
  const now = new Date();
  const debut = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    debut: debut.toISOString().slice(0, 10),
    fin: now.toISOString().slice(0, 10),
  };
}

function PastilleCertitude({ basis }: { readonly basis: CostBasis }) {
  return (
    <Badge variant="outline" className="font-normal" title={COST_BASIS_EXPLANATION_FR[basis]}>
      {COST_BASIS_LABELS_FR[basis]}
    </Badge>
  );
}

export function OperatingCostsView() {
  const dataAccess = useDataAccess();
  const defaut = useMemo(moisEnCours, []);
  const [debut, setDebut] = useState(defaut.debut);
  const [fin, setFin] = useState(defaut.fin);

  const rapport = useQuery({
    queryKey: ["couts-exploitation", debut, fin],
    queryFn: () => dataAccess.operatingCosts.costReport(debut, fin),
  });

  if (rapport.isPending) {
    return <AdminChargement error={rapport.error} />;
  }

  const lignes = rapport.data ?? [];
  const parCertitude = partParCertitude(lignes);
  const total = parCertitude.measured + parCertitude.estimated + parCertitude.apportioned;

  return (
    <div className="space-y-6">
      <SectionHeading
        level={1}
        eyebrow="Campus Santé Augmenté"
        title="Coûts d'exploitation"
        description="Ce que chaque programme consomme réellement, et ce qu'on ne peut que répartir. Les tarifs se règlent plus bas."
        figures={[
          { value: formatMontant(total), label: "Total sur la période" },
          { value: formatMontant(parCertitude.measured), label: "Mesuré" },
          { value: formatMontant(parCertitude.estimated), label: "Estimé" },
          { value: formatMontant(parCertitude.apportioned), label: "Réparti" },
        ]}
      />

      <ScopeNotice>
        Trois degrés de certitude, et l'écran ne les mélange jamais. <strong>Mesuré</strong> : les
        jetons d'IA et les octets stockés sont comptés exactement, programme par programme.{" "}
        <strong>Estimé</strong> : la sortie de données est reconstruite à partir des ouvertures de
        cours et du poids réel de chaque cours — un cours déjà en cache ne consomme rien.{" "}
        <strong>Réparti</strong> : le socle Supabase, Cloudflare et GitHub ne s'attribuent à aucun
        programme ; ils sont partagés au prorata des inscrits actifs. Seul le <em>total</em> se
        réconcilie avec une facture.
      </ScopeNotice>

      <PanelCard
        title="Période observée"
        description="Par défaut, le mois en cours. Les tarifs appliqués sont ceux en vigueur à la fin de la période."
      >
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="couts-debut">Du</Label>
            <Input
              id="couts-debut"
              type="date"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="couts-fin">Au</Label>
            <Input
              id="couts-fin"
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="min-h-11"
            />
          </div>
        </div>
      </PanelCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total sur la période"
          value={formatMontant(total)}
          hint={`${lignes.length} programme(s)`}
        />
        <StatCard
          label="Part mesurée"
          value={total === 0 ? "—" : `${Math.round((parCertitude.measured / total) * 100)} %`}
          hint="opposable à une facture"
          tone="done"
        />
        <StatCard
          label="Part estimée"
          value={total === 0 ? "—" : `${Math.round((parCertitude.estimated / total) * 100)} %`}
          hint="sortie de données"
          tone="attention"
        />
        <StatCard
          label="Part répartie"
          value={total === 0 ? "—" : `${Math.round((parCertitude.apportioned / total) * 100)} %`}
          hint="socle non ventilable"
        />
      </div>

      <PanelCard
        title="Par programme"
        description="Chaque montant porte son degré de certitude. Passez la souris sur une pastille pour savoir ce qu'il recouvre."
      >
        {lignes.length === 0 ? (
          <EmptyState>
            Aucun programme sur cette période — ou aucun relevé de facture enregistré. Les tarifs et
            les montants facturés se saisissent plus bas.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="pb-2 pe-3 text-start text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Programme
                  </th>
                  <th className="pb-2 pe-3 text-end text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    IA
                  </th>
                  <th className="pb-2 pe-3 text-end text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Stockage
                  </th>
                  <th className="pb-2 pe-3 text-end text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Sortie
                  </th>
                  <th className="pb-2 pe-3 text-end text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Quote-part
                  </th>
                  <th className="pb-2 text-end text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {lignes.map((row) => (
                  <tr key={row.programId} className="border-b last:border-0">
                    <td className="py-3 pe-3 align-top">
                      <span className="font-medium">{row.programName}</span>
                      <span className="text-muted-foreground block text-[12px]">
                        {row.learners} inscrit(s) actif(s)
                      </span>
                    </td>
                    <td className="py-3 pe-3 text-end align-top">
                      {formatMontant(row.aiCost)}
                      <span className="text-muted-foreground block text-[12px]">
                        {formatJetons(row.aiInputTokens)} / {formatJetons(row.aiOutputTokens)}{" "}
                        jetons
                      </span>
                      <span className="mt-1 block">
                        <PastilleCertitude basis={row.aiBasis} />
                      </span>
                    </td>
                    <td className="py-3 pe-3 text-end align-top">
                      {formatMontant(row.storageCost)}
                      <span className="text-muted-foreground block text-[12px]">
                        {formatGo(row.storageBytes)}
                      </span>
                      <span className="mt-1 block">
                        <PastilleCertitude basis={row.storageBasis} />
                      </span>
                    </td>
                    <td className="py-3 pe-3 text-end align-top">
                      {formatMontant(row.egressCost)}
                      <span className="text-muted-foreground block text-[12px]">
                        {row.courseOpenings} ouverture(s) · {formatGo(row.egressBytes)}
                      </span>
                      <span className="mt-1 block">
                        <PastilleCertitude basis={row.egressBasis} />
                      </span>
                    </td>
                    <td className="py-3 pe-3 text-end align-top">
                      {formatMontant(row.platformShare)}
                      <span className="mt-1 block">
                        <PastilleCertitude basis={row.platformBasis} />
                      </span>
                    </td>
                    <td className="py-3 text-end align-top font-medium">
                      {formatMontant(totalPour(row))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <UnitPricesPanel />
    </div>
  );
}
