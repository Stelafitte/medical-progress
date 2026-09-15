import { describe, expect, it } from "vitest";
import {
  DECISIONS_SIGNALEMENT,
  RAISONS_SIGNALEMENT,
  STATUTS_SIGNALEMENT_FR,
  estATraiter,
  libelleRaison,
} from "@/domain/questionReport";

describe("questionReport", () => {
  it("un signalement nouveau ou en cours reste à traiter ; les autres sont clos", () => {
    expect(estATraiter("nouveau")).toBe(true);
    expect(estATraiter("en_revue")).toBe(true);
    for (const s of ["corrige", "confirme", "rejete"]) expect(estATraiter(s)).toBe(false);
  });

  it("chaque décision a un libellé de statut, et un motif inconnu garde sa valeur", () => {
    for (const d of DECISIONS_SIGNALEMENT) expect(STATUTS_SIGNALEMENT_FR[d.value]).toBeTruthy();
    expect(RAISONS_SIGNALEMENT.map((r) => r.value)).toContain("recommandation");
    expect(libelleRaison("inconnu")).toBe("inconnu");
  });
});
