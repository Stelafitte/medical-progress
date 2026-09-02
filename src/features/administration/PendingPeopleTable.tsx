/**
 * La liste des personnes du sas, avec ce qu'on peut leur faire.
 *
 * UN SEUL TABLEAU, DEUX POINTS DE MONTAGE : l'onglet « Personnes et
 * inscriptions » l'affiche pour tout le programme, l'onglet « Classes
 * d'apprenants » le monte sous une classe, filtré sur elle. C'est la règle du
 * projet — ce qui doit être commun, ce sont les ENTRÉES et le rendu, pas
 * seulement le composant : deux tableaux jumeaux auraient divergé au premier
 * champ ajouté, et « annulée » aurait fini par vouloir dire deux choses.
 *
 * Ce composant ne charge rien et n'écrit rien lui-même : il reçoit les
 * personnes et rend les gestes à son appelant. C'est ce qui lui permet de
 * servir un écran qui lit tout le programme et un autre qui lit une classe.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/features/professional/mock-ui";
import {
  PENDING_PERSON_ISSUE_LABELS_FR,
  PENDING_PERSON_STATUS_LABELS_FR,
  fullNameOfPendingPerson,
  pendingPersonRemovalIssue,
  validatePendingPersonUpdate,
  type PendingPerson,
  type PendingPersonId,
  type UpdatePendingPersonInput,
} from "@/domain/peopleStaging";
import type { Cohort, CohortId } from "@/domain/types";

const NO_COHORT = "__none__";

interface Draft {
  firstName: string;
  lastName: string;
  loginEmail: string;
  institutionalId: string;
  cohortId: string;
}

function draftOf(person: PendingPerson): Draft {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    loginEmail: person.loginEmail,
    institutionalId: person.institutionalId ?? "",
    cohortId: person.intendedCohortId ?? NO_COHORT,
  };
}

/**
 * Le brouillon ramené à une révision.
 *
 * Un champ vidé n'est pas un champ absent : c'est la distinction que les deux
 * drapeaux portent jusqu'à la base. Les champs inchangés, eux, sont omis — une
 * révision ne doit pas réécrire ce que personne n'a touché.
 */
function updateFrom(person: PendingPerson, draft: Draft): UpdatePendingPersonInput {
  const cohortId = draft.cohortId === NO_COHORT ? undefined : (draft.cohortId as CohortId);
  const institutionalId = draft.institutionalId.trim();
  return {
    personId: person.id,
    ...(draft.firstName === person.firstName ? {} : { firstName: draft.firstName }),
    ...(draft.lastName === person.lastName ? {} : { lastName: draft.lastName }),
    ...(draft.loginEmail === person.loginEmail ? {} : { loginEmail: draft.loginEmail }),
    ...(institutionalId === (person.institutionalId ?? "")
      ? {}
      : institutionalId === ""
        ? { clearInstitutionalId: true }
        : { institutionalId }),
    ...(cohortId === person.intendedCohortId
      ? {}
      : cohortId === undefined
        ? { clearIntendedCohortId: true }
        : { intendedCohortId: cohortId }),
  };
}

export function PendingPeopleTable({
  people,
  cohorts,
  showCohortColumn = true,
  busyId,
  onUpdate,
  onSetCancelled,
  onSendInvitation,
}: {
  people: readonly PendingPerson[];
  cohorts: readonly Cohort[];
  /** Masqué quand la liste est déjà celle d'une seule promotion. */
  showCohortColumn?: boolean;
  busyId?: PendingPersonId | null;
  onUpdate: (input: UpdatePendingPersonInput) => Promise<void>;
  onSetCancelled: (personId: PendingPersonId, cancelled: boolean) => Promise<void>;
  onSendInvitation?: (personId: PendingPersonId) => Promise<void>;
}) {
  const [editing, setEditing] = useState<PendingPersonId | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (people.length === 0) {
    return <EmptyState>Aucune personne dans cette liste pour l'instant.</EmptyState>;
  }

  function startEditing(person: PendingPerson) {
    setEditing(person.id);
    setDraft(draftOf(person));
  }

  const columns = showCohortColumn ? 6 : 5;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Identifiant</TableHead>
            {showCohortColumn ? <TableHead>Promotion</TableHead> : null}
            <TableHead>Statut</TableHead>
            <TableHead className="text-end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => {
            const isEditing = editing === person.id && draft !== null;
            const cancelled = person.status === "cancelled";
            const removalIssue = pendingPersonRemovalIssue(person);
            const issues = isEditing
              ? validatePendingPersonUpdate(person, updateFrom(person, draft))
              : [];

            if (isEditing) {
              return (
                <TableRow key={person.id}>
                  <TableCell colSpan={columns} className="align-top">
                    <div className="space-y-3 py-2">
                      <p className="text-sm font-medium">
                        Modifier {fullNameOfPendingPerson(person)}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-first-${person.id}`}>Prénom</Label>
                          <Input
                            id={`edit-first-${person.id}`}
                            className="min-h-11"
                            value={draft.firstName}
                            onChange={(event) =>
                              setDraft({ ...draft, firstName: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-last-${person.id}`}>Nom</Label>
                          <Input
                            id={`edit-last-${person.id}`}
                            className="min-h-11"
                            value={draft.lastName}
                            onChange={(event) =>
                              setDraft({ ...draft, lastName: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-email-${person.id}`}>Adresse de connexion</Label>
                          <Input
                            id={`edit-email-${person.id}`}
                            type="email"
                            className="min-h-11"
                            disabled={person.status === "activated"}
                            value={draft.loginEmail}
                            onChange={(event) =>
                              setDraft({ ...draft, loginEmail: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-inst-${person.id}`}>
                            Identifiant institutionnel
                          </Label>
                          <Input
                            id={`edit-inst-${person.id}`}
                            className="min-h-11"
                            placeholder="vide = aucun"
                            value={draft.institutionalId}
                            onChange={(event) =>
                              setDraft({ ...draft, institutionalId: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-cohort-${person.id}`}>Promotion</Label>
                          <select
                            id={`edit-cohort-${person.id}`}
                            className="border-border bg-background min-h-11 w-full rounded-md border px-2 text-sm"
                            disabled={person.status === "activated"}
                            value={draft.cohortId}
                            onChange={(event) =>
                              setDraft({ ...draft, cohortId: event.target.value })
                            }
                          >
                            <option value={NO_COHORT}>aucune</option>
                            {cohorts.map((cohort) => (
                              <option key={cohort.id} value={cohort.id}>
                                {cohort.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {issues.length > 0 ? (
                        <ul className="text-destructive space-y-1 text-xs">
                          {issues.map((issue) => (
                            <li key={issue}>{PENDING_PERSON_ISSUE_LABELS_FR[issue]}</li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11"
                          disabled={issues.length > 0 || busyId === person.id}
                          onClick={() => {
                            void onUpdate(updateFrom(person, draft)).then(() => {
                              setEditing(null);
                              setDraft(null);
                            });
                          }}
                        >
                          {busyId === person.id ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => {
                            setEditing(null);
                            setDraft(null);
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }

            return (
              <TableRow key={person.id} className={cancelled ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{fullNameOfPendingPerson(person)}</TableCell>
                <TableCell className="break-all">{person.loginEmail}</TableCell>
                <TableCell className="text-muted-foreground">
                  {person.institutionalId ?? "—"}
                </TableCell>
                {showCohortColumn ? (
                  <TableCell>
                    {person.intendedCohortId ? (
                      (cohorts.find((c) => c.id === person.intendedCohortId)?.label ??
                      person.intendedCohortId)
                    ) : (
                      <span
                        className="text-destructive"
                        title="Sans promotion, l'activation ne créera ni inscription ni rôle apprenant : la personne ne verra aucun programme."
                      >
                        aucune
                      </span>
                    )}
                  </TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={cancelled ? "destructive" : "outline"} className="font-normal">
                    {PENDING_PERSON_STATUS_LABELS_FR[person.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => startEditing(person)}
                    >
                      Modifier
                    </Button>
                    {onSendInvitation &&
                    (person.status === "pending" || person.status === "invited") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={busyId === person.id}
                        onClick={() => void onSendInvitation(person.id)}
                      >
                        {person.status === "invited" ? "Renvoyer l'invitation" : "Inviter"}
                      </Button>
                    ) : null}
                    {/*
                      « Retirer », pas « Supprimer » : la ligne passe en annulée
                      et se remet. La base n'accorde aucun `delete` sur `people`,
                      et effacer ferait disparaître qui avait été inscrit.
                    */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busyId === person.id || (!cancelled && removalIssue !== undefined)}
                      title={
                        !cancelled && removalIssue !== undefined
                          ? PENDING_PERSON_ISSUE_LABELS_FR[removalIssue]
                          : undefined
                      }
                      onClick={() => void onSetCancelled(person.id, !cancelled)}
                    >
                      {cancelled ? "Remettre" : "Retirer"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
