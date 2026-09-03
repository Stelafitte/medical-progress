import { Badge } from "@/components/ui/badge";
import type { LearningResourceId, MasteryLevel, Outcome } from "@/domain/types";
import { OutcomeRow } from "@/features/passport/OutcomeRow";
import { ResourceTextPanel } from "@/features/resources/ResourceTextPanel";

export interface CoveringSupport {
  readonly id: LearningResourceId;
  readonly title: string;
}

/**
 * UNE connaissance du programme : ce qu'il faut savoir, de quoi l'apprendre, et
 * la déclaration de l'apprenant. Les trois objectifs du passeport tiennent sur
 * cette ligne.
 *
 * ON APPUIE SUR L'INTITULÉ ET LE CONTENU S'OUVRE. Le texte du support n'est
 * chargé qu'à ce moment-là : les 22 chapitres pèsent 1,16 M caractères, on ne
 * les fait jamais payer d'avance.
 *
 * La mise en page vient de `OutcomeRow`, partagée avec « Mes compétences ».
 */
export function KnowledgeRow({
  outcome,
  supports,
  declaredLevel,
}: {
  readonly outcome: Outcome;
  readonly supports: readonly CoveringSupport[];
  readonly declaredLevel?: MasteryLevel;
}) {
  return (
    <OutcomeRow
      outcome={outcome}
      {...(declaredLevel === undefined ? {} : { declaredLevel })}
      badges={
        outcome.knowledgeRank ? (
          <Badge variant="outline" className="ml-2 font-normal">
            rang {outcome.knowledgeRank}
          </Badge>
        ) : null
      }
    >
      {supports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun support ne traite encore cette connaissance.
        </p>
      ) : (
        <div className="space-y-4">
          {supports.map((support) => (
            <section key={support.id}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{support.title}</p>
              <ResourceTextPanel resourceId={support.id} />
            </section>
          ))}
        </div>
      )}
    </OutcomeRow>
  );
}
