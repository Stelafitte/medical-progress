/**
 * Tests de l'annuaire générique : séparation des concepts, ajout individuel,
 * doublons, import, retrait, archivage, périmètre et neutralité du type de programme.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUS_LABELS_FR,
  accountForPerson,
  addIndividual,
  applyRosterImport,
  archiveCohort,
  filterDirectoryRows,
  findAccountByEmail,
  findPersonByEmail,
  fullNameOf,
  hasActiveEnrollment,
  normaliseEmail,
  selectProgramDirectory,
  summariseDirectory,
  withdrawEnrollment,
  type DirectoryState,
} from "@/domain/directory";
import { buildRosterPreview } from "@/domain/cohortRoster";
import type { ProgramId } from "@/domain/types";

const NOW = "2026-08-19T10:00:00.000Z";

function makeState(): DirectoryState {
  return {
    isSimulated: true,
    people: [
      {
        id: "per-a",
        firstName: "Camille",
        lastName: "Rousseau",
        origin: "fixture",
        createdAt: NOW,
      },
    ],
    accounts: [
      {
        id: "acc-a",
        personId: "per-a",
        loginEmail: "camille@example.org",
        status: "active",
        invitedAt: NOW,
        isSimulated: true,
      },
    ],
    cohorts: [
      { id: "coh-dfasm", programId: "prog-dfasm", label: "DFASM2", academicYear: "2026-2027", lifecycle: "active" },
      { id: "coh-diu", programId: "prog-diu", label: "DIU 2026", academicYear: "2026-2027", lifecycle: "active" },
      { id: "coh-dpc", programId: "prog-dpc", label: "DPC HVG", academicYear: "2026", lifecycle: "active" },
      { id: "coh-other", programId: "prog-other", label: "Programme test", academicYear: "2026", lifecycle: "active" },
    ],
    enrollments: [
      {
        id: "enr-a",
        personId: "per-a",
        programId: "prog-dfasm",
        cohortId: "coh-dfasm",
        status: "active",
        origin: "fixture",
        enrolledAt: NOW,
      },
    ],
    roleAssignments: [
      {
        personId: "per-a",
        role: "learner",
        scope: { kind: "cohort", programId: "prog-dfasm", cohortId: "coh-dfasm" },
        grantedAt: NOW,
        provenance: { sourceSystem: "native" },
      },
    ],
  };
}

const base = {
  firstName: "Nicolas",
  lastName: "Perrin",
  role: "learner" as const,
  enrollmentStatus: "active" as const,
  now: NOW,
};

describe("séparation des concepts", () => {
  it("distingue Person, UserAccount, Cohort et Enrollment", () => {
    const state = makeState();
    const person = state.people[0]!;
    const account = accountForPerson(state, person.id)!;
    expect(account.personId).toBe(person.id);
    expect(account.loginEmail).toBe("camille@example.org");
    // La personne ne porte PAS l'e-mail : il vit sur le compte.
    expect(Object.keys(person)).not.toContain("email");
    expect(state.enrollments[0]!.cohortId).toBe("coh-dfasm");
    expect(ACCOUNT_STATUS_LABELS_FR[account.status]).toBe("actif");
    expect(state.isSimulated).toBe(true);
  });

  it("expose le nom complet dérivé du prénom et du nom", () => {
    expect(fullNameOf(makeState().people[0]!)).toBe("Camille Rousseau");
  });
});

describe("ajout individuel", () => {
  it("crée la personne, un compte invité et l'inscription", () => {
    const result = addIndividual(makeState(), {
      ...base,
      email: "nicolas@example.org",
      programId: "prog-dfasm",
      cohortId: "coh-dfasm",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachedExistingPerson).toBe(false);
    const account = findAccountByEmail(result.state, "nicolas@example.org")!;
    expect(account.status).toBe("invited");
    expect(account.isSimulated).toBe(true);
    expect(result.state.enrollments).toHaveLength(2);
  });

  it("normalise l'e-mail (casse et espaces)", () => {
    const result = addIndividual(makeState(), {
      ...base,
      email: "  NICOLAS@Example.ORG ",
      programId: "prog-dfasm",
      cohortId: "coh-dfasm",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findAccountByEmail(result.state, "nicolas@example.org")).toBeDefined();
    expect(normaliseEmail(" A@B.ORG ")).toBe("a@b.org");
  });

  it("refuse les champs obligatoires vides et les e-mails invalides", () => {
    const state = makeState();
    expect(
      addIndividual(state, { ...base, lastName: "", email: "x@y.org", programId: "prog-dfasm", cohortId: "coh-dfasm" }).ok,
    ).toBe(false);
    const invalid = addIndividual(state, {
      ...base,
      email: "pas-un-email",
      programId: "prog-dfasm",
      cohortId: "coh-dfasm",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("invalid_email");
  });

  it("détecte un e-mail déjà connu de la plateforme et propose le rattachement", () => {
    const state = makeState();
    const result = addIndividual(state, {
      ...base,
      email: "Camille@example.org",
      programId: "prog-diu",
      cohortId: "coh-diu",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("existing_person_requires_choice");
    expect(result.existingPerson?.id).toBe("per-a");
  });

  it("rattache la personne existante sans la dupliquer", () => {
    const state = makeState();
    const result = addIndividual(state, {
      ...base,
      email: "camille@example.org",
      programId: "prog-diu",
      cohortId: "coh-diu",
      attachExistingPerson: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachedExistingPerson).toBe(true);
    expect(result.state.people).toHaveLength(1);
    expect(result.state.accounts).toHaveLength(1);
  });

  it("autorise une même personne dans plusieurs programmes", () => {
    const first = addIndividual(makeState(), {
      ...base,
      email: "camille@example.org",
      programId: "prog-diu",
      cohortId: "coh-diu",
      attachExistingPerson: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addIndividual(first.state, {
      ...base,
      email: "camille@example.org",
      programId: "prog-dpc",
      cohortId: "coh-dpc",
      attachExistingPerson: true,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const programs = second.state.enrollments
      .filter((e) => e.personId === "per-a")
      .map((e) => e.programId);
    expect(new Set(programs).size).toBe(3);
  });

  it("refuse un doublon actif dans le même programme et la même cohorte", () => {
    const result = addIndividual(makeState(), {
      ...base,
      email: "camille@example.org",
      programId: "prog-dfasm",
      cohortId: "coh-dfasm",
      attachExistingPerson: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("duplicate_active_enrollment");
  });

  it("refuse une inscription dans une cohorte archivée", () => {
    const archived = archiveCohort(makeState(), "coh-diu");
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    const result = addIndividual(archived.state, {
      ...base,
      email: "nouveau@example.org",
      programId: "prog-diu",
      cohortId: "coh-diu",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("archived_cohort");
  });

  it("fonctionne à l'identique pour DFASM, DIU, DPC et un type other", () => {
    const targets: readonly (readonly [ProgramId, string])[] = [
      ["prog-dfasm", "coh-dfasm"],
      ["prog-diu", "coh-diu"],
      ["prog-dpc", "coh-dpc"],
      ["prog-other", "coh-other"],
    ];
    for (const [programId, cohortId] of targets) {
      const result = addIndividual(makeState(), {
        ...base,
        email: `test-${programId}@example.org`,
        programId,
        cohortId,
      });
      expect(result.ok).toBe(true);
    }
  });
});

describe("import groupé", () => {
  const csv = [
    "Nom;Prénom;Email;N° étudiant",
    "Perrin;Nicolas;nicolas@example.org;2026001",
    "Rousseau;Camille;camille@example.org;2026002",
    "Doublon;Nicolas;nicolas@example.org;2026003",
    "SansEmail;Ana;;2026004",
  ].join("\n");

  const tsv = csv.replace(/;/g, "\t");

  function importableFrom(text: string, existingEmails: readonly string[]) {
    const preview = buildRosterPreview({ text, existingEmails });
    return {
      preview,
      rows: preview.candidates
        .filter((c) => c.status === "ready" || c.status === "already_enrolled")
        .map((c) => ({
          line: c.line,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          studentNumber: c.studentNumber,
        })),
    };
  }

  it("lit un CSV et un TSV de la même façon", () => {
    const a = buildRosterPreview({ text: csv });
    const b = buildRosterPreview({ text: tsv });
    expect(a.candidates.length).toBe(b.candidates.length);
    expect(a.readyCount).toBe(b.readyCount);
  });

  it("signale les erreurs ligne par ligne", () => {
    const preview = buildRosterPreview({ text: csv });
    const invalid = preview.candidates.find((c) => c.status === "invalid");
    expect(invalid?.line).toBe(5);
    expect(invalid?.issues[0]?.message).toContain("Email");
  });

  it("prend en compte un mapping manuel quand la détection échoue", () => {
    const anonymous = ["c1;c2;c3", "Perrin;Nicolas;nicolas@example.org"].join("\n");
    expect(buildRosterPreview({ text: anonymous }).missingRequiredColumns.length).toBe(3);
    const mapped = buildRosterPreview({
      text: anonymous,
      mapping: { lastName: 0, firstName: 1, email: 2 },
    });
    expect(mapped.missingRequiredColumns).toHaveLength(0);
    expect(mapped.readyCount).toBe(1);
  });

  it("met à jour l'état local après confirmation, en rattachant les e-mails connus", () => {
    const state = makeState();
    const { rows } = importableFrom(csv, state.accounts.map((a) => a.loginEmail));
    const { state: next, report } = applyRosterImport(state, {
      programId: "prog-diu",
      cohortId: "coh-diu",
      role: "learner",
      rows,
      existingEmailStrategy: "attach",
      now: NOW,
    });
    expect(report.created).toBe(1);
    expect(report.attached).toBe(1);
    // Le doublon interne et la ligne en erreur ont déjà été exclus à l'étape de contrôle.
    expect(report.skipped).toBe(0);
    expect(report.rejected).toBe(0);
    expect(next.people).toHaveLength(2);
    expect(selectProgramDirectory(next, "prog-diu").rows).toHaveLength(2);
  });

  it("ignore un doublon d'e-mail présent deux fois dans les lignes transmises", () => {
    const rows = [
      { line: 2, firstName: "Nicolas", lastName: "Perrin", email: "nicolas@example.org" },
      { line: 3, firstName: "Nicolas", lastName: "Perrin", email: "NICOLAS@example.org" },
    ];
    const { state: next, report } = applyRosterImport(makeState(), {
      programId: "prog-diu",
      cohortId: "coh-diu",
      role: "learner",
      rows,
      existingEmailStrategy: "attach",
      now: NOW,
    });
    expect(report.created).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.lines[1]!.result).toBe("skipped_duplicate");
    expect(next.people).toHaveLength(2);
  });

  it("ignore les e-mails connus quand la stratégie est « ignorer »", () => {
    const state = makeState();
    const { rows } = importableFrom(csv, state.accounts.map((a) => a.loginEmail));
    const { state: next, report } = applyRosterImport(state, {
      programId: "prog-diu",
      cohortId: "coh-diu",
      role: "learner",
      rows,
      existingEmailStrategy: "skip",
      now: NOW,
    });
    expect(report.attached).toBe(0);
    expect(findPersonByEmail(next, "camille@example.org")?.id).toBe("per-a");
    expect(selectProgramDirectory(next, "prog-diu").rows).toHaveLength(1);
  });
});

describe("retrait et archivage", () => {
  it("retire l'inscription sans supprimer la personne ni son compte", () => {
    const state = makeState();
    const result = withdrawEnrollment(state, "enr-a", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.enrollments[0]!.status).toBe("withdrawn");
    expect(result.state.enrollments[0]!.withdrawnAt).toBe(NOW);
    expect(result.state.people).toHaveLength(1);
    expect(result.state.accounts).toHaveLength(1);
    expect(hasActiveEnrollment(result.state, "per-a", "prog-dfasm", "coh-dfasm")).toBe(false);
  });

  it("archive une cohorte sans perdre ses inscriptions", () => {
    const result = archiveCohort(makeState(), "coh-dfasm");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cohorts.find((c) => c.id === "coh-dfasm")!.lifecycle).toBe("archived");
    expect(result.state.enrollments).toHaveLength(1);
  });
});

describe("périmètre et filtres", () => {
  it("ne renvoie que les inscrits du programme demandé", () => {
    const attached = addIndividual(makeState(), {
      ...base,
      email: "camille@example.org",
      programId: "prog-diu",
      cohortId: "coh-diu",
      attachExistingPerson: true,
    });
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    const dfasm = selectProgramDirectory(attached.state, "prog-dfasm");
    expect(dfasm.rows).toHaveLength(1);
    expect(dfasm.cohorts.every((c) => c.programId === "prog-dfasm")).toBe(true);
    expect(dfasm.rows[0]!.roles).toEqual(["learner"]);
  });

  it("résume les comptes non activés et les cohortes archivées", () => {
    const added = addIndividual(makeState(), {
      ...base,
      email: "nouveau@example.org",
      programId: "prog-dfasm",
      cohortId: "coh-dfasm",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const summary = summariseDirectory(selectProgramDirectory(added.state, "prog-dfasm"));
    expect(summary.enrolledCount).toBe(2);
    expect(summary.withoutActivatedAccount).toBe(1);
    expect(summary.duplicateEmailCount).toBe(0);
  });

  it("filtre par recherche, cohorte et statut", () => {
    const scope = selectProgramDirectory(makeState(), "prog-dfasm");
    expect(filterDirectoryRows(scope.rows, { search: "camille" })).toHaveLength(1);
    expect(filterDirectoryRows(scope.rows, { search: "inconnu" })).toHaveLength(0);
    expect(filterDirectoryRows(scope.rows, { cohortId: "coh-diu" })).toHaveLength(0);
    expect(filterDirectoryRows(scope.rows, { enrollmentStatus: "withdrawn" })).toHaveLength(0);
    expect(filterDirectoryRows(scope.rows, { role: "teacher" })).toHaveLength(0);
  });
});
