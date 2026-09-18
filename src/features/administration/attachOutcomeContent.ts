/**
 * Rattache un contenu saisi à la main à une connaissance ou une compétence
 * qui vient d'être créée.
 *
 * POURQUOI PASSER PAR UN SUPPORT, plutôt qu'une colonne sur l'acquis.
 *
 * Le texte pédagogique doit vivre à UN SEUL endroit. Il est déjà conservé,
 * pour tout ce qui est importé, dans `learning_resource_texts` — c'est ce que
 * liront l'interrogation d'un cours, l'interrogation de l'apprenant et la
 * génération de QCM. Une colonne `content` sur `outcomes` créerait un second
 * gisement : chaque usage devrait interroger les deux, et le jour où l'un des
 * deux serait oublié, la moitié du contenu deviendrait invisible sans qu'aucune
 * erreur ne le signale.
 *
 * La saisie manuelle emprunte donc exactement le chemin de l'import : un
 * support léger, rattaché à l'acquis, dont le texte part dans la même table et
 * le même découpage. Le contenu reste ensuite modifiable comme n'importe quel
 * support de la médiathèque.
 *
 * Aucune migration : `create_learning_resource` accepte déjà les identifiants
 * d'acquis et pose les liens dans le même appel.
 */
import type { DataAccess } from "@/application/ports/repositories";
import { STORAGE_SEGMENT_CHARS, splitText } from "@/infrastructure/text/documentText";
import type { CurriculumVersionId, Outcome, ProgramId } from "@/domain/types";

export async function attachOutcomeContent(
  dataAccess: DataAccess,
  input: {
    readonly programId: ProgramId;
    readonly curriculumVersionId: CurriculumVersionId;
    readonly outcome: Outcome;
    readonly content: string;
  },
): Promise<number> {
  const content = input.content.trim();
  if (content.length === 0) return 0;

  const resource = await dataAccess.resources.createResource({
    programId: input.programId,
    curriculumVersionId: input.curriculumVersionId,
    title: `${input.outcome.code} — ${input.outcome.label}`,
    description: "Contenu saisi à la création de l'acquis.",
    format: "other",
    // Le contenu reste réservé à l'équipe tant que personne n'a décidé de
    // l'ouvrir : ouvrir par défaut publierait aux apprenants un texte que son
    // auteur croyait encore en cours de rédaction.
    visibility: "staff_only",
    outcomeIds: [input.outcome.id],
  });

  return dataAccess.resources.storeResourceText(
    resource.id,
    "",
    splitText(content, STORAGE_SEGMENT_CHARS),
  );
}

/**
 * Une adresse de cours acceptable : http(s) seulement. Rend l'adresse
 * normalisée, ou `null` si elle n'en est pas une (18/09).
 */
export function normalizeCourseUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Rattache un COURS EN LIGNE (simple lien) à l'acquis qui vient d'être créé
 * (18/09, demande de Stef). Même chemin que l'ajout d'un lien dans la
 * Médiathèque : un support `link` portant `external_url`, lié à l'acquis.
 *
 * VISIBLE DES APPRENANTS, à la différence du contenu saisi : un lien vers un
 * cours est fait pour être ouvert par l'étudiant, et il ne l'est de toute façon
 * qu'une fois sa promotion ouverte.
 */
export async function attachOutcomeLink(
  dataAccess: DataAccess,
  input: {
    readonly programId: ProgramId;
    readonly curriculumVersionId: CurriculumVersionId;
    readonly outcome: Outcome;
    readonly url: string;
  },
): Promise<boolean> {
  const url = normalizeCourseUrl(input.url);
  if (!url) return false;
  await dataAccess.resources.createResource({
    programId: input.programId,
    curriculumVersionId: input.curriculumVersionId,
    title: `${input.outcome.code} — ${input.outcome.label} (cours en ligne)`,
    description: "Lien saisi à la création de l'acquis.",
    format: "link",
    visibility: "program",
    externalUrl: url,
    outcomeIds: [input.outcome.id],
  });
  return true;
}
