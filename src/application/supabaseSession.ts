import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccess } from "@/application/ports/repositories";

export class AuthenticationRequiredError extends Error {
  constructor(message = "Aucune session Supabase authentifiée.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class NoProgramAccessError extends Error {
  constructor() {
    super("Aucun programme accessible pour cet utilisateur.");
    this.name = "NoProgramAccessError";
  }
}

export async function loadAuthenticatedSupabaseSession(
  client: SupabaseClient,
  dataAccess: DataAccess,
) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new AuthenticationRequiredError(error?.message);
  }

  const person = await dataAccess.people.getPerson(data.user.id);
  if (!person) throw new Error("Le profil applicatif de l’utilisateur est introuvable.");

  const [programs, enrollments, roles] = await Promise.all([
    dataAccess.programs.listPrograms(),
    dataAccess.people.listEnrollments(person.id),
    dataAccess.people.listRoleAssignments(person.id),
  ]);
  if (programs.length === 0) throw new NoProgramAccessError();

  return { person, programs, enrollments, roles };
}
