/**
 * LES TARIFS ET LES MONTANTS FACTURÉS — saisis ici, jamais écrits en dur.
 *
 * Stef, 16/09 : « idéalement le coût est automatiquement implémenté après MAJ
 * sur les sites ».
 *
 * LE PRINCIPE, ET POURQUOI ON NE LIT PAS LES PAGES TARIFAIRES. Les grilles de
 * prix changent de FORME, pas seulement de chiffre : un lecteur de page casse
 * en silence, et personne ne s'en aperçoit avant l'écart. On relève donc ce
 * qu'on a été RÉELLEMENT facturé, et le prix unitaire effectif s'en déduit —
 * montant ÷ compteurs. Il se recale tout seul à chaque changement de tarif, et
 * le total de l'écran réconcilie avec la facture par construction.
 *
 * UN TARIF NE REMPLACE PAS LE PRÉCÉDENT, il prend effet à une date. Sans cela,
 * recalculer un mois passé appliquerait le prix d'aujourd'hui.
 *
 * RELEVER DEUX FOIS LA MÊME PÉRIODE CORRIGE AU LIEU D'EMPILER : une facture
 * arrive, puis se précise — c'est la base qui tient cette règle.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  COST_PROVIDER_LABELS_FR,
  COST_UNIT_LABELS_FR,
  formatMontant,
  type CostProvider,
  type CostUnitKind,
} from "@/domain/operatingCost";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";

const UNITES: readonly CostUnitKind[] = [
  "ai_input_tokens",
  "ai_output_tokens",
  "storage_gb_month",
  "egress_gb",
];

const FOURNISSEURS: readonly CostProvider[] = [
  "anthropic",
  "openai",
  "mistral",
  "supabase",
  "cloudflare",
  "github",
];

const CHAMP = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";

export function UnitPricesPanel() {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);

  const [kind, setKind] = useState<CostUnitKind>("egress_gb");
  const [fournisseur, setFournisseur] = useState<CostProvider>("supabase");
  const [prix, setPrix] = useState("");
  const [effetLe, setEffetLe] = useState("");

  const [factFournisseur, setFactFournisseur] = useState<CostProvider>("supabase");
  const [factDebut, setFactDebut] = useState("");
  const [factFin, setFactFin] = useState("");
  const [factMontant, setFactMontant] = useState("");

  const tarifs = useQuery({
    queryKey: ["tarifs-unitaires"],
    queryFn: () => dataAccess.operatingCosts.listUnitPrices(),
  });
  const releves = useQuery({
    queryKey: ["releves-de-facture"],
    queryFn: () => dataAccess.operatingCosts.listBillingStatements(),
  });

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["tarifs-unitaires"] });
    void queryClient.invalidateQueries({ queryKey: ["releves-de-facture"] });
    void queryClient.invalidateQueries({ queryKey: ["couts-exploitation"] });
    setErreur(null);
  };

  const poserTarif = useMutation({
    mutationFn: () =>
      dataAccess.operatingCosts.setUnitPrice({
        kind,
        provider: fournisseur,
        unitPrice: Number.parseFloat(prix.replace(",", ".")),
        ...(effetLe === "" ? {} : { effectiveFrom: effetLe }),
      }),
    onSuccess: () => {
      rafraichir();
      setPrix("");
    },
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Tarif refusé."),
  });

  const poserReleve = useMutation({
    mutationFn: () =>
      dataAccess.operatingCosts.recordBillingStatement({
        provider: factFournisseur,
        periodStart: factDebut,
        periodEnd: factFin,
        amount: Number.parseFloat(factMontant.replace(",", ".")),
      }),
    onSuccess: () => {
      rafraichir();
      setFactMontant("");
    },
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Relevé refusé."),
  });

  const prixValide = Number.isFinite(Number.parseFloat(prix.replace(",", "."))) && prix !== "";
  const montantValide =
    Number.isFinite(Number.parseFloat(factMontant.replace(",", "."))) && factMontant !== "";

  return (
    <>
      {erreur ? (
        <p className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-[13px]">
          {erreur}
        </p>
      ) : null}

      <PanelCard
        title="Ce qui a été facturé"
        description="La source de vérité. Relevez le montant réel : c'est lui qui donne le prix unitaire effectif, et qui fait que le total de l'écran réconcilie avec la facture."
        tone="action"
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="fact-fournisseur">Fournisseur</Label>
            <select
              id="fact-fournisseur"
              className={CHAMP}
              value={factFournisseur}
              onChange={(e) => setFactFournisseur(e.target.value as CostProvider)}
            >
              {FOURNISSEURS.map((f) => (
                <option key={f} value={f}>
                  {COST_PROVIDER_LABELS_FR[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fact-debut">Du</Label>
            <Input
              id="fact-debut"
              type="date"
              className="min-h-11"
              value={factDebut}
              onChange={(e) => setFactDebut(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fact-fin">Au</Label>
            <Input
              id="fact-fin"
              type="date"
              className="min-h-11"
              value={factFin}
              onChange={(e) => setFactFin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fact-montant">Montant (USD)</Label>
            <Input
              id="fact-montant"
              inputMode="decimal"
              className="min-h-11"
              value={factMontant}
              onChange={(e) => setFactMontant(e.target.value)}
              placeholder="25.00"
            />
          </div>
        </div>
        <Button
          type="button"
          className="min-h-11"
          disabled={!montantValide || factDebut === "" || factFin === "" || poserReleve.isPending}
          onClick={() => poserReleve.mutate()}
        >
          {poserReleve.isPending ? (
            <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
          ) : null}
          Enregistrer le montant facturé
        </Button>

        {(releves.data ?? []).length === 0 ? (
          <EmptyState>
            Aucun montant relevé. Sans facture, aucun coût ne peut être calculé.
          </EmptyState>
        ) : (
          <ul className="space-y-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
            {(releves.data ?? []).map((r) => (
              <li key={r.id} className="text-[13px]">
                <span className="font-medium">{COST_PROVIDER_LABELS_FR[r.provider]}</span>{" "}
                <span className="text-muted-foreground">
                  {formatFrDate(r.periodStart)} → {formatFrDate(r.periodEnd)} ·{" "}
                  {formatMontant(r.amount, r.currency)} · relevé le {formatFrDate(r.observedOn)}
                </span>{" "}
                <Badge variant="outline" className="font-normal">
                  {r.source === "api" ? "automatique" : "saisi"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Tarifs unitaires"
        description="Utilisés pour ventiler le montant facturé entre les programmes, et pour chiffrer le stockage et la sortie de données. Un tarif prend effet à une date : il ne réécrit pas le passé."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="tarif-unite">Unité</Label>
            <select
              id="tarif-unite"
              className={CHAMP}
              value={kind}
              onChange={(e) => setKind(e.target.value as CostUnitKind)}
            >
              {UNITES.map((u) => (
                <option key={u} value={u}>
                  {COST_UNIT_LABELS_FR[u]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarif-fournisseur">Fournisseur</Label>
            <select
              id="tarif-fournisseur"
              className={CHAMP}
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value as CostProvider)}
            >
              {FOURNISSEURS.map((f) => (
                <option key={f} value={f}>
                  {COST_PROVIDER_LABELS_FR[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarif-prix">Prix (USD)</Label>
            <Input
              id="tarif-prix"
              inputMode="decimal"
              className="min-h-11"
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              placeholder="0.09"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarif-effet">Effet le (défaut : aujourd'hui)</Label>
            <Input
              id="tarif-effet"
              type="date"
              className="min-h-11"
              value={effetLe}
              onChange={(e) => setEffetLe(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          className="min-h-11"
          disabled={!prixValide || poserTarif.isPending}
          onClick={() => poserTarif.mutate()}
        >
          {poserTarif.isPending ? (
            <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
          ) : null}
          Enregistrer le tarif
        </Button>

        {(tarifs.data ?? []).length === 0 ? (
          <EmptyState>
            Aucun tarif enregistré. Sans tarif, le stockage et la sortie de données restent à zéro.
          </EmptyState>
        ) : (
          <ul className="space-y-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
            {(tarifs.data ?? []).map((t) => (
              <li key={t.id} className="text-[13px]">
                <span className="font-medium">{COST_UNIT_LABELS_FR[t.kind]}</span>{" "}
                <span className="text-muted-foreground">
                  {COST_PROVIDER_LABELS_FR[t.provider]} · {formatMontant(t.unitPrice, t.currency)} ·
                  depuis le {formatFrDate(t.effectiveFrom)}
                </span>{" "}
                <Badge variant="outline" className="font-normal">
                  {t.source === "invoice_derived" ? "déduit d'une facture" : "saisi"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </>
  );
}
