import { describe, expect, it } from "vitest";
import {
  allSelected,
  groupDirectory,
  planCampaign,
  planFirstLogin,
  someSelected,
  toggleMany,
  type DirectoryRow,
} from "../communicationDirectory";

/**
 * Ces tests verrouillent LA RÈGLE, pas l'affichage : quel geste s'applique à
 * quelle ligne. C'est la seule chose de cet écran qui, si elle se trompe,
 * produit une erreur invisible — un mail d'invitation envoyé à quelqu'un de
 * déjà connecté échoue côté Supabase, pas à l'écran.
 */

function ligne(over: Partial<DirectoryRow> & Pick<DirectoryRow, "rowKey">): DirectoryRow {
  return {
    kind: "learner",
    fullName: "Sans nom",
    groupLabel: "Promotion A",
    accountState: "active",
    emailMasked: "a***a@x.fr",
    optedOut: false,
    ...over,
  };
}

describe("groupDirectory", () => {
  it("rend toujours les trois blocs, même vides", () => {
    const blocs = groupDirectory([]);
    expect(blocs.map((b) => b.kind)).toEqual([
      "learner",
      "placement_supervisor",
      "placement_manager",
    ]);
    expect(blocs.every((b) => b.total === 0)).toBe(true);
  });

  it("découpe les apprenants par promotion et trie les noms en français", () => {
    const blocs = groupDirectory([
      ligne({ rowKey: "1", groupId: "c1", groupLabel: "Promotion A", fullName: "Zoé" }),
      ligne({ rowKey: "2", groupId: "c1", groupLabel: "Promotion A", fullName: "Élodie" }),
      ligne({ rowKey: "3", groupId: "c2", groupLabel: "Promotion B", fullName: "Adam" }),
    ]);
    const apprenants = blocs[0]!;
    expect(apprenants.total).toBe(3);
    expect(apprenants.groups.map((g) => g.label)).toEqual(["Promotion A", "Promotion B"]);
    expect(apprenants.groups[0]!.rows.map((r) => r.fullName)).toEqual(["Élodie", "Zoé"]);
  });

  it("regroupe les lignes sans rattachement au lieu de les perdre", () => {
    const blocs = groupDirectory([
      ligne({ rowKey: "1", groupLabel: "Sans rattachement" }),
      ligne({ rowKey: "2", groupLabel: "Sans rattachement" }),
    ]);
    expect(blocs[0]!.groups).toHaveLength(1);
    expect(blocs[0]!.groups[0]!.rows).toHaveLength(2);
  });
});

describe("planFirstLogin", () => {
  it("envoie le vivier vers invite-person et les comptes vers resend-first-login", () => {
    const plan = planFirstLogin([
      ligne({ rowKey: "v", stagingId: "p-1", accountState: "staged" }),
      ligne({ rowKey: "i", stagingId: "p-2", accountState: "invited" }),
      ligne({ rowKey: "c", personId: "u-1", accountState: "never_signed_in" }),
      ligne({ rowKey: "a", personId: "u-2", accountState: "active" }),
    ]);
    expect(plan.toInvite).toEqual(["p-1", "p-2"]);
    expect(plan.toResend).toEqual(["u-1", "u-2"]);
    expect(plan.skipped).toHaveLength(0);
  });

  it("écarte une ligne sans adresse, quel que soit son état", () => {
    const plan = planFirstLogin([
      ligne({ rowKey: "x", personId: "u-1", accountState: "no_address" }),
    ]);
    expect(plan.toResend).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toBe("aucune adresse connue");
  });
});

describe("planCampaign", () => {
  it("EXCLUT LE VIVIER : sans profil, aucune trace d'envoi ne peut exister", () => {
    const plan = planCampaign([
      ligne({ rowKey: "v", stagingId: "p-1", accountState: "staged" }),
      ligne({ rowKey: "c", personId: "u-1" }),
    ]);
    expect(plan.personIds).toEqual(["u-1"]);
    expect(plan.excluded).toHaveLength(1);
    expect(plan.excluded[0]!.reason).toBe("vivier");
  });

  it("exclut un désabonné et une adresse manquante, séparément", () => {
    const plan = planCampaign([
      ligne({ rowKey: "d", personId: "u-1", optedOut: true }),
      ligne({ rowKey: "s", personId: "u-2", accountState: "no_address" }),
    ]);
    expect(plan.personIds).toHaveLength(0);
    expect(plan.excluded.map((e) => e.reason).sort()).toEqual(["desabonne", "sans_adresse"]);
  });
});

describe("sélection", () => {
  const rows = [ligne({ rowKey: "a" }), ligne({ rowKey: "b" })];

  it("une liste vide n'est jamais « tout sélectionné »", () => {
    expect(allSelected([], new Set())).toBe(false);
  });

  it("distingue partiel et complet", () => {
    expect(someSelected(rows, new Set(["a"]))).toBe(true);
    expect(allSelected(rows, new Set(["a"]))).toBe(false);
    expect(allSelected(rows, new Set(["a", "b"]))).toBe(true);
    expect(someSelected(rows, new Set(["a", "b"]))).toBe(false);
  });

  it("bascule un bloc sans toucher aux lignes voisines", () => {
    const avant = new Set(["autre"]);
    const apres = toggleMany(avant, rows, true);
    expect([...apres].sort()).toEqual(["a", "autre", "b"]);
    expect([...toggleMany(apres, rows, false)]).toEqual(["autre"]);
  });
});

describe("dédoublonnage — une personne, plusieurs rôles", () => {
  /* Stef porte « encadrant » ET « responsable de terrain » : l'annuaire le rend
     une fois par attribution, donc deux lignes pour une seule personne. Sans
     dédoublonnage il recevrait tout en double, et se verrait écarté deux fois. */
  it("une personne présente dans deux blocs n'est invitée qu'une fois", () => {
    const plan = planFirstLogin([
      ligne({ rowKey: "staged:m:sup", stagingId: "m", accountState: "staged" }),
      ligne({ rowKey: "staged:m:man", stagingId: "m", accountState: "staged" }),
    ]);
    expect(plan.toInvite).toEqual(["m"]);
  });

  it("une personne à deux rôles ne reçoit le message qu'une fois", () => {
    const plan = planCampaign([
      ligne({ rowKey: "role:s:sup", personId: "s" }),
      ligne({ rowKey: "role:s:man", personId: "s" }),
    ]);
    expect(plan.personIds).toEqual(["s"]);
  });

  it("un exclu n'est signalé qu'une fois", () => {
    const plan = planCampaign([
      ligne({ rowKey: "a", personId: "s", optedOut: true }),
      ligne({ rowKey: "b", personId: "s", optedOut: true }),
    ]);
    expect(plan.excluded).toHaveLength(1);
  });
});
