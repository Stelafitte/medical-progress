/**
 * Supports du programme « DPC HVG–Amylose » dans la médiathèque : métadonnées
 * uniquement (aucun fichier, aucune URL appelée). Publiés, donc exploitables
 * par le tuteur IA simulé comme n'importe quel autre contenu du socle.
 */
import type { MediaResource } from "@/domain/mediaLibrary";
import { DPC_HVG_PROGRAM_ID } from "./dpcHvgFixtures";

const native = { sourceSystem: "native" } as const;

const support = (
  id: string,
  title: string,
  module: string,
  description: string,
  outcomeIds: readonly string[],
  fileLabel: string,
): MediaResource => ({
  id,
  programId: DPC_HVG_PROGRAM_ID,
  title,
  kind: "pdf",
  module,
  description,
  outcomeIds,
  version: "v1.0",
  status: "published",
  visibility: "program",
  authorPersonId: "per-dpc-hvg-expert",
  updatedAt: "2026-06-10T09:00:00Z",
  needsReview: false,
  asset: { kind: "file", label: fileLabel, sizeHint: "1,4 Mo", storageActivated: false },
  versions: [
    {
      version: "v1.0",
      changedAt: "2026-06-10T09:00:00Z",
      authorPersonId: "per-dpc-hvg-expert",
      summary: "Support de séquence validé, références scientifiques identifiées.",
      status: "published",
    },
  ],
  provenance: native,
});

export const dpcHvgMediaResources: readonly MediaResource[] = [
  support(
    "med-dpc-hvg-seq1",
    "Séquence 1 — Quand penser à une amylose cardiaque ? Les red flags",
    "Formation présentielle — séquence 1",
    "Signes d'alerte cardiaques et extracardiaques, pièges diagnostiques, cas clinique du patient de 79 ans.",
    ["out-dpc-hvg-amylose"],
    "dpc-hvg-seq1-red-flags-v1.pdf",
  ),
  support(
    "med-dpc-hvg-seq2",
    "Séquence 2 — Le parcours diagnostique moderne",
    "Formation présentielle — séquence 2",
    "Algorithme diagnostique : strain, IRM, scintigraphie osseuse, bilan monoclonal, génétique et centres experts.",
    ["out-dpc-hvg-qualification", "out-dpc-hvg-amylose"],
    "dpc-hvg-seq2-parcours-diagnostique-v1.pdf",
  ),
  support(
    "med-dpc-hvg-seq3",
    "Séquence 3 — Les traitements qui changent le pronostic",
    "Formation présentielle — séquence 3",
    "Traitements spécifiques ATTR et AL, indications, suivi multidisciplinaire et parcours de soins.",
    ["out-dpc-hvg-amylose", "out-dpc-hvg-pratique"],
    "dpc-hvg-seq3-traitements-v1.pdf",
  ),
  support(
    "med-dpc-hvg-grille",
    "Grille d'audit clinique HVG — 29 critères (version 1.0)",
    "Évaluation des pratiques professionnelles",
    "Grille publiée utilisée aux deux tours d'audit, avec le guide de codage Oui / Non / N/A.",
    ["out-dpc-hvg-pratique"],
    "dpc-hvg-grille-audit-v1.pdf",
  ),
];
