/**
 * LE STAGE REELLEMENT EN PLACE, LU EN DIRECT (11/09).
 *
 * POURQUOI CET ECRAN EXISTE. La rubrique « Stage » du Concepteur décrivait le
 * stage avec un texte libre saisi ici, pendant que le stage, lui, vivait dans
 * « Gestion des stages ». Deux récits du même objet, aucun lien : la case
 * restait décochée sur DFASM alors qu'un étudiant était en stage, et le texte
 * de la carte ne valait que le jour où on l'avait tapé. Stef, le 11/09 :
 * « les 2 entités sont liées », puis « fais un vrai lien ».
 *
 * LE LIEN EST UNE LECTURE, PAS UNE COPIE. Rien n'est recopié dans le
 * brouillon de conception : la carte affiche `placements`, `assignments`,
 * `groups` et `stage_logs` tels que la base les donne. Un terrain renommé
 * ailleurs se renomme ici au rechargement suivant, et la divergence
 * texte/réalité devient impossible par construction — c'est tout l'intérêt,
 * et c'est ce qu'un champ de saisie ne pouvait pas offrir.
 *
 * CE QUE LA CARTE NE FAIT PAS : écrire. La conception ne commande pas le
 * terrain ; elle le constate. Créer ou modifier un terrain reste le geste de
 * « Gestion des stages » et du mode « Implémenter maintenant ».
 */
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/features/professional/mock-ui";
import { etudiantsAffectes, formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { ProgramAdminScope } from "@/features/administration/useProgramAdmin";

/** Bornes d'une période, sur un lot de dates ISO. Absentes si le lot est vide. */
function periode(
  bornes: readonly { readonly startsOn: string; readonly endsOn: string }[],
): string | null {
  if (bornes.length === 0) return null;
  let debut = bornes[0]!.startsOn;
  let fin = bornes[0]!.endsOn;
  for (const b of bornes) {
    if (b.startsOn < debut) debut = b.startsOn;
    if (b.endsOn > fin) fin = b.endsOn;
  }
  return `${formatFrDate(debut)} → ${formatFrDate(fin)}`;
}

export function StageEnPlace({ scope }: { scope: ProgramAdminScope }) {
  const { placements, assignments, groups, cohorts, templates, stageLogs, enrollments } = scope;

  if (placements.length === 0) {
    return (
      <EmptyState>
        Aucun terrain de stage n'est encore rattaché à ce programme. Passez la rubrique sur «
        Implémenter maintenant » pour en créer un, ou utilisez l'onglet « Gestion des stages ».
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {placements.map((placement) => {
        const affectations = assignments.filter((a) => a.placementId === placement.id);
        const groupes = groups.filter((g) => g.placementId === placement.id);

        /* Les promotions concernées se lisent des DEUX côtés : un groupe porte
           sa cohorte, une affectation porte son inscription. Ne regarder qu'un
           seul côté laisserait invisible un étudiant affecté sans groupe — le
           trou d'accès mesuré le 11/09. */
        const cohortIds = new Set<string>();
        for (const g of groupes) cohortIds.add(g.cohortId as string);
        for (const a of affectations) {
          const inscription = enrollments.find((e) => e.id === a.enrollmentId);
          if (inscription) cohortIds.add(inscription.cohortId as string);
        }
        const promotions = cohorts.filter((c) => cohortIds.has(c.id as string));

        const carnets = stageLogs.filter(
          (log) =>
            (log.placementId !== undefined && log.placementId === placement.id) ||
            (log.placementId === undefined &&
              affectations.some((a) => a.enrollmentId === log.enrollmentId)),
        );
        const periodeDesCarnets = periode(
          carnets.flatMap((log) =>
            log.periodStartsOn !== undefined && log.periodEndsOn !== undefined
              ? [{ startsOn: log.periodStartsOn, endsOn: log.periodEndsOn }]
              : [],
          ),
        );

        return (
          <article key={placement.id} className="border-border space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{placement.name}</p>
              <Badge variant="outline" className="font-normal">
                en place dans ce programme
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {placement.site}
              {placement.department ? ` · ${placement.department}` : ""} · {placement.capacity}{" "}
              place(s)
            </p>

            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium">Promotions concernées</dt>
                <dd className="text-muted-foreground">
                  {promotions.length === 0
                    ? "aucune"
                    : promotions.map((c) => `${c.label} (${c.academicYear})`).join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Période</dt>
                <dd className="text-muted-foreground">
                  {periode(affectations) ??
                    periode(promotions) ??
                    "non fixée — elle vient des affectations"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Étudiants affectés</dt>
                <dd className="text-muted-foreground">
                  {etudiantsAffectes(affectations)} sur {placement.capacity} place(s)
                </dd>
              </div>
              <div>
                <dt className="font-medium">Groupes d'encadrement</dt>
                <dd className="text-muted-foreground">
                  {groupes.length === 0
                    ? "aucun groupe : tout le monde est suivi par les encadrants du terrain"
                    : groupes
                        .map(
                          (g) =>
                            `${g.label} — ${g.memberEnrollmentIds.length} étudiant(s), ${g.supervisorPersonIds.length} encadrant(s)`,
                        )
                        .join(" · ")}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium">Carnets ouverts</dt>
                <dd className="text-muted-foreground">
                  {carnets.length === 0
                    ? "aucun carnet ouvert pour l'instant"
                    : `${carnets.length} carnet(s)${
                        periodeDesCarnets === null ? "" : ` · ${periodeDesCarnets}`
                      }`}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}

      {/*
        LE MODE DE VALIDATION EST DECRIT ICI, ET IL EST DEMATERIALISE.
        Stef, le 11/09 : « ici dans DFASM le carnet de stage est présent et est
        dématérialisé (jours à cocher, commentaires…) ». Il n'y a donc pas de
        carnet papier à rapporter, et rien à décrire à la main dans cette carte.
      */}
      <div className="border-border space-y-1.5 rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">Mode de validation — carnet dématérialisé</p>
        <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-xs">
          <li>
            L'étudiant coche ses journées de présence dans son carnet et y ajoute ses commentaires.
          </li>
          <li>
            L'encadrant confirme les compétences déclarées et la présence, semaine après semaine.
          </li>
          <li>
            Le stage est prononcé par le responsable de stage ou l'administrateur du programme,
            depuis « Bilan de stage » — l'encadrant ne prononce pas.
          </li>
          <li>
            {templates.length === 0
              ? "Aucun modèle de carnet formel n'est défini : le carnet dématérialisé fait foi."
              : `${templates.length} modèle(s) de carnet défini(s) pour ce programme.`}
          </li>
        </ul>
      </div>
    </div>
  );
}
