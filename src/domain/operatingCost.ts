/**
 * LES COÛTS D'EXPLOITATION, PAR PROGRAMME — le vocabulaire, côté client.
 *
 * Stef, 16/09 au soir : « est-il possible de calculer les coûts d'utilisation
 * pour chaque programme : coût GitHub, coût cloud, coût IA ? »
 *
 * LA RÉPONSE DU 17/09 QUI DÉCIDE DE TOUT : les clés IA des programmes sont
 * dans le MÊME espace de facturation. Aucune facture ne dira donc jamais « ce
 * programme a coûté X ». Le coût IA est une RÉPARTITION au prorata des jetons
 * comptés chez nous — assiette exacte, prix dérivé de la facture. Seul le
 * TOTAL se réconcilie, et par construction.
 *
 * LE PIÈGE QUE CE FICHIER EXISTE POUR ÉVITER : afficher un euro mesuré et un
 * euro estimé dans la même colonne sans les distinguer. Le premier écart avec
 * une vraie facture décrédibiliserait tout l'écran. Le degré de certitude vient
 * DE LA BASE (`cost_basis_kind`), poste par poste — ce n'est pas une convention
 * d'affichage qu'on pourrait oublier en chemin.
 */
import type { ProgramId } from "@/domain/types";

/** Le degré de certitude d'une ligne de coût. Rendu par la RPC, jamais deviné. */
export type CostBasis = "measured" | "estimated" | "apportioned";

export const COST_BASIS_LABELS_FR: Record<CostBasis, string> = {
  measured: "mesuré",
  estimated: "estimé",
  apportioned: "réparti",
};

/** Ce que chaque degré veut dire, en une phrase, pour qui lit le tableau. */
export const COST_BASIS_EXPLANATION_FR: Record<CostBasis, string> = {
  measured:
    "L'assiette est comptée exactement pour ce programme. Le prix vient de la facture réelle.",
  estimated:
    "L'assiette est reconstruite : ouvertures de cours × poids réel du cours. Un cours déjà en cache ne consomme rien, un cours abandonné ne consomme qu'une part.",
  apportioned:
    "Rien n'est attribuable à un programme : le montant est réparti au prorata des inscrits actifs.",
};

export type CostProvider =
  "anthropic" | "openai" | "mistral" | "supabase" | "cloudflare" | "github";

export const COST_PROVIDER_LABELS_FR: Record<CostProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  mistral: "Mistral",
  supabase: "Supabase",
  cloudflare: "Cloudflare",
  github: "GitHub",
};

export type CostUnitKind =
  "ai_input_tokens" | "ai_output_tokens" | "storage_gb_month" | "egress_gb" | "platform_flat_month";

export const COST_UNIT_LABELS_FR: Record<CostUnitKind, string> = {
  ai_input_tokens: "Jetons d'entrée (par million)",
  ai_output_tokens: "Jetons de sortie (par million)",
  storage_gb_month: "Stockage (par Go et par mois)",
  egress_gb: "Sortie de données (par Go)",
  platform_flat_month: "Forfait mensuel",
};

export interface ProgramCostRow {
  readonly programId: ProgramId;
  readonly programName: string;
  readonly learners: number;
  readonly aiInputTokens: number;
  readonly aiOutputTokens: number;
  readonly aiCost: number;
  readonly aiBasis: CostBasis;
  readonly storageBytes: number;
  readonly storageCost: number;
  readonly storageBasis: CostBasis;
  readonly courseOpenings: number;
  readonly egressBytes: number;
  readonly egressCost: number;
  readonly egressBasis: CostBasis;
  readonly platformShare: number;
  readonly platformBasis: CostBasis;
}

export interface UnitPrice {
  readonly id: string;
  readonly kind: CostUnitKind;
  readonly provider: CostProvider;
  readonly model: string;
  readonly unitPrice: number;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly source: "invoice_derived" | "manual";
  readonly note?: string | null;
}

export interface BillingStatement {
  readonly id: string;
  readonly provider: CostProvider;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly amount: number;
  readonly currency: string;
  readonly source: "api" | "manual";
  readonly observedOn: string;
  readonly note?: string | null;
}

/** Le total d'un programme, tous postes confondus. */
export function totalPour(row: ProgramCostRow): number {
  return row.aiCost + row.storageCost + row.egressCost + row.platformShare;
}

/**
 * CE QUI EST MESURÉ, CE QUI NE L'EST PAS — la ventilation que l'écran doit
 * afficher en tête. Un lecteur qui voit « 42 € » doit savoir tout de suite
 * quelle part de ce chiffre il peut opposer à une facture.
 */
export function partParCertitude(rows: readonly ProgramCostRow[]): Record<CostBasis, number> {
  const total: Record<CostBasis, number> = { measured: 0, estimated: 0, apportioned: 0 };
  for (const row of rows) {
    total[row.aiBasis] += row.aiCost;
    total[row.storageBasis] += row.storageCost;
    total[row.egressBasis] += row.egressCost;
    total[row.platformBasis] += row.platformShare;
  }
  return total;
}

/** Les octets se lisent en Go dès qu'on parle d'argent : personne ne facture l'octet. */
export function enGo(octets: number): number {
  return octets / 1_073_741_824;
}

export function formatGo(octets: number): string {
  const go = enGo(octets);
  if (go === 0) return "0 Go";
  if (go < 0.01) return `${(octets / 1_048_576).toFixed(1)} Mo`;
  return `${go.toFixed(go < 1 ? 3 : 2)} Go`;
}

export function formatMontant(montant: number, devise = "USD"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: devise,
    minimumFractionDigits: montant < 1 && montant > 0 ? 3 : 2,
    maximumFractionDigits: montant < 1 && montant > 0 ? 3 : 2,
  }).format(montant);
}

export function formatJetons(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k`;
  return String(n);
}

/**
 * LE SEUIL CLOUDFLARE, qui n'est PAS un coût mais une panne annoncée.
 *
 * Un seul Worker sert tous les programmes : sa consommation ne se répartit pas.
 * Ce qu'il faut en revanche, c'est voir venir les 100 000 requêtes par jour du
 * plan gratuit — au-delà, ce n'est pas une facture qui arrive, c'est le site
 * qui refuse de répondre.
 */
export const CLOUDFLARE_SEUIL_JOURNALIER = 100_000;
