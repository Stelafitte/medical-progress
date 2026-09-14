import { describe, expect, it } from "vitest";
import {
  describePendingPersonWriteError,
  findPersonByLoginEmail,
  normalizeLoginEmail,
  pendingPersonRemovalIssue,
  roleIntentIssue,
  statusAfterRestore,
  validatePendingPersonCreation,
  validatePendingPersonUpdate,
  type PendingPerson,
} from "@/domain/peopleStaging";
import type { CohortId, PlacementId, ProgramId } from "@/domain/types";

function person(overrides: Partial<PendingPerson> = {}): PendingPerson {
  return {
    id: "p-1",
    programId: "prog-1" as ProgramId,
    firstName: "Camille",
    lastName: "Roubertie",
    loginEmail: "camille.roubertie@example.org",
    origin: "import",
    status: "pending",
    createdAt: "2026-09-01T08:00:00Z",
    updatedAt: "2026-09-01T08:00:00Z",
    ...overrides,
  };
}

describe("réviser une personne du sas", () => {
  it("accepte une correction de nom et d'identifiant", () => {
    expect(
      validatePendingPersonUpdate(person(), {
        personId: "p-1",
        lastName: "Roubertie-Martin",
        institutionalId: "21904312",
      }),
    ).toEqual([]);
  });

  it("refuse un nom ou un prénom vidé", () => {
    const issues = validatePendingPersonUpdate(person(), {
      personId: "p-1",
      firstName: "  ",
      lastName: "",
    });
    expect(issues).toEqual(["prenom_manquant", "nom_manquant"]);
  });

  it("refuse une adresse qui n'est pas une adresse", () => {
    expect(
      validatePendingPersonUpdate(person(), { personId: "p-1", loginEmail: "camille" }),
    ).toEqual(["email_invalide"]);
  });

  it("fige l'adresse de connexion une fois le compte activé", () => {
    // Elle vit dans auth.users : la changer ici ne changerait pas l'identifiant
    // avec lequel la personne se connecte.
    const activated = person({ status: "activated", activatedProfileId: "prof-1" });
    expect(
      validatePendingPersonUpdate(activated, { personId: "p-1", loginEmail: "AUTRE@example.org" }),
    ).toEqual(["email_fige_apres_activation"]);
  });

  it("accepte la même adresse écrite autrement sur un compte activé", () => {
    // Normaliser n'est pas modifier : la base impose déjà minuscules et espaces
    // rognés, donc « Camille.Roubertie@Example.org » désigne la même personne.
    const activated = person({ status: "activated", activatedProfileId: "prof-1" });
    expect(
      validatePendingPersonUpdate(activated, {
        personId: "p-1",
        loginEmail: " Camille.Roubertie@Example.org ",
      }),
    ).toEqual([]);
  });

  it("fige la promotion une fois le compte activé", () => {
    const activated = person({
      status: "activated",
      activatedProfileId: "prof-1",
      intendedCohortId: "c-1" as CohortId,
    });
    expect(
      validatePendingPersonUpdate(activated, {
        personId: "p-1",
        intendedCohortId: "c-2" as CohortId,
      }),
    ).toEqual(["promotion_figee_apres_activation"]);
    expect(
      validatePendingPersonUpdate(activated, { personId: "p-1", clearIntendedCohortId: true }),
    ).toEqual(["promotion_figee_apres_activation"]);
  });

  it("laisse passer une révision qui ne touche pas à la promotion d'un activé", () => {
    const activated = person({
      status: "activated",
      activatedProfileId: "prof-1",
      intendedCohortId: "c-1" as CohortId,
    });
    expect(
      validatePendingPersonUpdate(activated, {
        personId: "p-1",
        intendedCohortId: "c-1" as CohortId,
        firstName: "Camille",
      }),
    ).toEqual([]);
  });
});

describe("retirer et remettre une personne du sas", () => {
  it("refuse de retirer une personne dont le compte est activé", () => {
    expect(pendingPersonRemovalIssue(person({ status: "activated" }))).toBe(
      "retrait_impossible_apres_activation",
    );
  });

  it("laisse retirer une personne en attente ou invitée", () => {
    expect(pendingPersonRemovalIssue(person())).toBeUndefined();
    expect(pendingPersonRemovalIssue(person({ status: "invited" }))).toBeUndefined();
  });

  it("rend son statut « invitée » à qui avait déjà reçu son e-mail", () => {
    // Sinon le bouton proposerait un premier envoi là où il s'agit d'un renvoi.
    expect(statusAfterRestore(person({ invitedAt: "2026-09-02T09:00:00Z" }))).toBe("invited");
    expect(statusAfterRestore(person())).toBe("pending");
  });
});

describe("l'adresse de connexion", () => {
  it("se normalise comme la base l'exige", () => {
    expect(normalizeLoginEmail("  Camille.ROUBERTIE@Example.org ")).toBe(
      "camille.roubertie@example.org",
    );
  });
});

describe("une adresse déjà prise dans le programme", () => {
  it("retrouve la personne quelle que soit la casse saisie", () => {
    const people = [person(), person({ id: "p-2", loginEmail: "agathe.leger@etu.example.fr" })];
    expect(findPersonByLoginEmail(people, " Agathe.Leger@ETU.example.fr ")?.id).toBe("p-2");
  });

  it("la retrouve même retirée : l'unicité couvre aussi les annulées", () => {
    // C'est le cas qui déroute : la personne n'est plus dans la liste active,
    // mais son adresse occupe toujours la place.
    const people = [person({ status: "cancelled", cancelledAt: "2026-09-02T10:00:00Z" })];
    expect(findPersonByLoginEmail(people, "camille.roubertie@example.org")?.status).toBe(
      "cancelled",
    );
  });

  it("ne retrouve rien sur une adresse libre", () => {
    expect(findPersonByLoginEmail([person()], "libre@example.org")).toBeUndefined();
  });
});

describe("les erreurs d'écriture de la base", () => {
  it("traduit la contrainte d'unicité au lieu de la recopier", () => {
    const message = describePendingPersonWriteError(
      new Error(
        'duplicate key value violates unique constraint "people_program_id_login_email_key"',
      ),
    );
    expect(message).toContain("déjà utilisée");
    expect(message).not.toContain("duplicate key");
  });

  it("laisse passer telle quelle une erreur qu'elle ne connaît pas", () => {
    // Masquer une erreur non reconnue serait pire que la montrer.
    expect(describePendingPersonWriteError(new Error("connexion perdue"))).toBe("connexion perdue");
  });
});

describe("creer une personne du vivier", () => {
  const base = {
    programId: "prog-1" as ProgramId,
    firstName: "Jean",
    lastName: "Dupont",
    loginEmail: "Jean.Dupont@example.org",
  };

  it("accepte une saisie complete, majuscules comprises", () => {
    expect(validatePendingPersonCreation(base)).toEqual([]);
  });

  it("refuse un prenom vide, un nom vide et une adresse qui n en est pas une", () => {
    expect(
      validatePendingPersonCreation({
        ...base,
        firstName: "  ",
        lastName: "",
        loginEmail: "jean.dupont",
      }),
    ).toEqual(["prenom_manquant", "nom_manquant", "email_invalide"]);
  });
});

describe("l intention de role", () => {
  const base = {
    programId: "prog-1" as ProgramId,
    firstName: "Jean",
    lastName: "Dupont",
    loginEmail: "jean.dupont@example.org",
  };

  it("laisse passer une saisie sans intention : ancien comportement", () => {
    expect(roleIntentIssue(base)).toBeUndefined();
  });

  it("exige un terrain pour un encadrant, comme la contrainte de la base", () => {
    expect(roleIntentIssue({ ...base, intendedRole: "placement_supervisor" })).toBe(
      "Un encadrant doit viser un terrain de stage.",
    );
    expect(
      roleIntentIssue({
        ...base,
        intendedRole: "placement_supervisor",
        intendedPlacementId: "terrain-1" as PlacementId,
      }),
    ).toBeUndefined();
  });

  it("exige une promotion pour un apprenant", () => {
    expect(roleIntentIssue({ ...base, intendedRole: "learner" })).toBe(
      "Un apprenant doit viser une promotion.",
    );
    expect(
      roleIntentIssue({
        ...base,
        intendedRole: "learner",
        intendedCohortId: "promo-1" as CohortId,
      }),
    ).toBeUndefined();
  });
});
