/**
 * Ajouter UNE personne au sas de pré-inscription.
 *
 * Extrait de « Personnes et inscriptions » le 02/09 pour être monté aussi sous
 * une classe, avec sa promotion déjà choisie — c'est là que le geste se pense :
 * « ajouter un étudiant à cette promotion », pas « créer une personne puis lui
 * trouver une promotion ». Même composant, deux points de montage, comme
 * l'import de liste juste à côté.
 */
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MockBadge, PanelCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  PENDING_PERSON_STATUS_LABELS_FR,
  describePendingPersonWriteError,
  findPersonByLoginEmail,
  fullNameOfPendingPerson,
  type PendingPerson,
} from "@/domain/peopleStaging";
import type { Cohort, CohortId } from "@/domain/types";

/** « Aucune promotion » : une valeur, pas un vide — un Select ne rend pas `undefined`. */
const NO_COHORT = "__none__";

export function RealIndividualPersonForm({
  programId,
  cohorts,
  defaultCohortId,
  existingPeople,
  lockCohort = false,
  idPrefix = "real-dir",
  title = "Ajouter une personne",
  onCreated,
}: {
  programId: string;
  cohorts: readonly Cohort[];
  /** Promotion pré-choisie quand le formulaire est monté sous une classe. */
  defaultCohortId?: CohortId;
  /**
   * Les personnes déjà dans le sas de ce programme, pour dire AVANT l'envoi
   * qu'une adresse est prise. Facultatif : l'écran qui ne les a pas garde le
   * refus de la base, simplement traduit.
   */
  existingPeople?: readonly PendingPerson[];
  /** Verrouille ce choix : sous une classe, la destination n'est pas une question. */
  lockCohort?: boolean;
  /**
   * Les identifiants des champs sont préfixés parce que ce formulaire se monte
   * DEUX fois dans la même page : un `id` en dur ferait pointer le libellé du
   * second sur le champ du premier, et le clic sur « Nom » donnerait le focus
   * au mauvais endroit.
   */
  idPrefix?: string;
  title?: string;
  onCreated: () => void | Promise<void>;
}) {
  const dataAccess = useDataAccess();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [institutionalId, setInstitutionalId] = useState("");
  const [cohortId, setCohortId] = useState<string>(defaultCohortId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /*
   * L'adresse déjà prise se voit AVANT le clic. La contrainte de la base reste
   * l'autorité — elle voit les lignes que cet écran ne charge pas — mais elle
   * répond par un nom de contrainte, qui ne dit ni QUI occupe l'adresse ni
   * qu'elle peut être occupée par quelqu'un de retiré.
   */
  const clash =
    email.trim() === "" ? undefined : findPersonByLoginEmail(existingPeople ?? [], email);

  async function submit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const created = await dataAccess.peopleStaging.createPendingPerson({
        programId,
        firstName,
        lastName,
        loginEmail: email,
        ...(institutionalId ? { institutionalId } : {}),
        ...(cohortId && cohortId !== NO_COHORT ? { intendedCohortId: cohortId as CohortId } : {}),
      });
      const cohortLabel =
        cohortId && cohortId !== NO_COHORT
          ? cohorts.find((c) => c.id === cohortId)?.label
          : undefined;
      setSuccess(
        cohortLabel
          ? `${created.firstName} ${created.lastName} est créée dans le sas, rattachée à « ${cohortLabel} ». Son inscription et son rôle apprenant seront créés à sa première connexion.`
          : `${created.firstName} ${created.lastName} est créée dans le sas, SANS promotion : à sa première connexion, son compte s'activera mais aucune inscription ne sera créée et elle ne verra aucun programme.`,
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setInstitutionalId("");
      setCohortId(defaultCohortId ?? "");
      await onCreated();
    } catch (reason) {
      setError(describePendingPersonWriteError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PanelCard
      title={title}
      description="Crée pour de vrai une ligne dans le sas de pré-inscription de ce programme. Aucun e-mail n'est envoyé tant que l'invitation n'est pas déclenchée explicitement."
      action={<MockBadge label="Données réelles (Supabase)" />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-firstname`}>Prénom</Label>
          <Input
            id={`${idPrefix}-firstname`}
            value={firstName}
            className="min-h-11"
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-lastname`}>Nom</Label>
          <Input
            id={`${idPrefix}-lastname`}
            value={lastName}
            className="min-h-11"
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-email`}>E-mail de connexion</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={email}
            className="min-h-11"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-institutional`}>
            Identifiant institutionnel (facultatif)
          </Label>
          <Input
            id={`${idPrefix}-institutional`}
            value={institutionalId}
            className="min-h-11"
            onChange={(e) => setInstitutionalId(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-cohort`}>Promotion</Label>
          <Select value={cohortId} onValueChange={setCohortId} disabled={lockCohort}>
            <SelectTrigger id={`${idPrefix}-cohort`} className="min-h-11">
              <SelectValue placeholder="Choisir une promotion…" />
            </SelectTrigger>
            <SelectContent>
              {cohorts.map((cohort) => (
                <SelectItem key={cohort.id} value={cohort.id}>
                  {cohort.label}
                </SelectItem>
              ))}
              <SelectItem value={NO_COHORT}>
                Aucune — membre de l'équipe, pas un étudiant
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            C'est la promotion qui fait l'étudiant : à la première connexion, elle seule déclenche
            la création de l'inscription et du rôle apprenant. « Aucune » crée bien le compte, mais
            la personne ne verra aucun programme tant qu'un rôle ne lui aura pas été accordé
            autrement.
          </p>
          {cohorts.length === 0 ? (
            <p className="text-xs text-destructive">
              Aucune promotion n'existe pour ce programme : créez-en une avant d'ajouter des
              étudiants, sinon leur compte s'activera dans le vide.
            </p>
          ) : null}
        </div>
      </div>

      {clash ? (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
          {fullNameOfPendingPerson(clash)} occupe déjà cette adresse dans ce programme (
          {PENDING_PERSON_STATUS_LABELS_FR[clash.status]}). Corrigez cette personne plutôt que d'en
          créer une seconde — une même adresse ne peut désigner qu'un compte.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{success}</p>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="min-h-11"
        disabled={
          submitting || !firstName || !lastName || !email || !cohortId || clash !== undefined
        }
        onClick={() => void submit()}
      >
        <UserPlus className="mr-2 size-4" aria-hidden />
        {submitting ? "Création…" : "Ajouter à ce programme (réel)"}
      </Button>
    </PanelCard>
  );
}
