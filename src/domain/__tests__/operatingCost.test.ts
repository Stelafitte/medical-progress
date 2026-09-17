import { describe, expect, it } from "vitest";
import {
  COST_BASIS_LABELS_FR,
  formatGo,
  formatJetons,
  partParCertitude,
  totalPour,
  type ProgramCostRow,
} from "../operatingCost";
import type { ProgramId } from "../types";

const ligne = (patch: Partial<ProgramCostRow> = {}): ProgramCostRow => ({
  programId: "prog-1" as ProgramId,
  programName: "DFASM Cardiologie",
  learners: 10,
  aiInputTokens: 0,
  aiOutputTokens: 0,
  aiCost: 0,
  aiBasis: "measured",
  storageBytes: 0,
  storageCost: 0,
  storageBasis: "measured",
  courseOpenings: 0,
  egressBytes: 0,
  egressCost: 0,
  egressBasis: "estimated",
  platformShare: 0,
  platformBasis: "apportioned",
  ...patch,
});

describe("le total d'un programme", () => {
  it("additionne les quatre postes, sans en oublier aucun", () => {
    expect(
      totalPour(ligne({ aiCost: 1.5, storageCost: 0.25, egressCost: 2, platformShare: 6.25 })),
    ).toBe(10);
  });
});

describe("la ventilation par degré de certitude", () => {
  /* ⚠️ LE PIÈGE QUE CE CHANTIER EXISTE POUR ÉVITER : mélanger un euro mesuré
     et un euro estimé. Le premier écart avec une vraie facture décrédibilise
     tout l'écran. Ces cas verrouillent la séparation. */
  it("range chaque poste sous SON degré, jamais sous celui du programme", () => {
    const parts = partParCertitude([
      ligne({ aiCost: 4, storageCost: 1, egressCost: 3, platformShare: 2 }),
    ]);
    expect(parts.measured).toBe(5); // IA + stockage
    expect(parts.estimated).toBe(3); // egress
    expect(parts.apportioned).toBe(2); // quote-part
  });

  it("cumule sur plusieurs programmes", () => {
    const parts = partParCertitude([
      ligne({ aiCost: 1, egressCost: 1, platformShare: 1 }),
      ligne({ programId: "prog-2" as ProgramId, aiCost: 2, egressCost: 2, platformShare: 2 }),
    ]);
    expect(parts.measured).toBe(3);
    expect(parts.estimated).toBe(3);
    expect(parts.apportioned).toBe(3);
  });

  it("rend trois zéros sur une plateforme vide plutôt que des trous", () => {
    expect(partParCertitude([])).toEqual({ measured: 0, estimated: 0, apportioned: 0 });
  });

  it("suit le degré rendu par la BASE, même s'il change", () => {
    /* Le jour où les clés IA seront dans des espaces de facturation distincts,
       la base rendra `measured` pour un poste aujourd'hui réparti. L'écran doit
       suivre sans qu'on retouche une ligne d'affichage. */
    const parts = partParCertitude([ligne({ aiCost: 9, aiBasis: "apportioned" })]);
    expect(parts.apportioned).toBe(9);
    expect(parts.measured).toBe(0);
  });

  it("nomme les trois degrés en français", () => {
    expect(COST_BASIS_LABELS_FR.measured).toBe("mesuré");
    expect(COST_BASIS_LABELS_FR.estimated).toBe("estimé");
    expect(COST_BASIS_LABELS_FR.apportioned).toBe("réparti");
  });
});

describe("les unités lisibles", () => {
  it("passe en mégaoctets sous le centième de gigaoctet — personne ne lit « 0,002 Go »", () => {
    expect(formatGo(0)).toBe("0 Go");
    expect(formatGo(2_537_000)).toBe("2.4 Mo");
    expect(formatGo(50_740_000)).toBe("0.047 Go");
    expect(formatGo(5 * 1_073_741_824)).toBe("5.00 Go");
  });

  it("abrège les jetons sans les arrondir à faux", () => {
    expect(formatJetons(0)).toBe("0");
    expect(formatJetons(950)).toBe("950");
    expect(formatJetons(12_400)).toBe("12.4 k");
    expect(formatJetons(3_500_000)).toBe("3.50 M");
  });
});
