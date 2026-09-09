import type { ReactNode } from "react";

import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { OutcomeRow } from "@/features/passport/OutcomeRow";
import { ResourceMediaPlayer } from "@/features/resources/ResourceMediaPlayer";
import { ChapterTextPanel } from "@/features/resources/ChapterTextPanel";

/**
 * LA LIGNE D'UN ACQUIS DU PLAN, avec son contenu pédagogique.
 *
 * Stef, 04/09 : « dans mon passeport éducatif, il faut qu'en cliquant sur les
 * items du calendrier, du gantt, ou kanban, je voie les contenus pédagogiques ».
 *
 * Les trois vues du Passeport n'affichaient qu'un code et un intitulé — le
 * Gantt et le Kanban n'avaient même pas l'interrupteur de déclaration. Le
 * composant qui fait déjà tout cela existait : `OutcomeRow`, celui de « Mes
 * ressources » et « Mes compétences ». Ce fichier n'ajoute donc pas une
 * quatrième mise en page, il APPORTE LA MÊME aux trois vues restantes.
 *
 * AUCUNE REQUÊTE NOUVELLE. `useLearnerPassport` charge déjà les supports avec
 * leurs `outcomeIds` ; react-query sert le même cache à chaque ligne. Faire
 * descendre la donnée en props à travers PassportView, OutcomeScheduleSection
 * et les trois vues aurait touché cinq fichiers pour rien.
 *
 * PAS DE LECTEUR PDF : `resource_format` prévoit `pdf`, mais aucun support de
 * ce format n'est en base (Stef, 04/09). On n'écrit pas un lecteur pour un
 * corpus vide — le jour où il y en aura, c'est ici qu'il se branchera.
 */
export function PlanOutcomeRow({
  item,
  badges,
  extra,
}: {
  readonly item: AcquisitionPlanItem;
  /** Étiquettes sur la ligne fermée — nature, avancement selon la vue. */
  readonly badges?: ReactNode;
  /** Ce que la vue ajoute sous les contenus : avancement, échéance, actions. */
  readonly extra?: ReactNode;
}) {
  const { data } = useLearnerPassport();
  const outcome = data?.outcomes.find((candidat) => candidat.id === item.id);
  const supports = (data?.resources ?? []).filter((resource) =>
    resource.outcomeIds.includes(item.id),
  );

  if (outcome === undefined) return null;

  return (
    <OutcomeRow
      outcome={outcome}
      {...(item.declaredLevel === undefined ? {} : { declaredLevel: item.declaredLevel })}
      {...(badges === undefined ? {} : { badges })}
      supportCount={supports.length}
      supportKind={supports.some((support) => support.format === "video") ? "video" : "text"}
    >
      <div className="space-y-4">
        {supports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun support ne traite encore cet acquis.
          </p>
        ) : (
          supports.map((support) => (
            <section key={support.id}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{support.title}</p>
              {support.format === "video" ? (
                <ResourceMediaPlayer resourceId={support.id} title={support.title} />
              ) : (
                /*
                  TEXTE 2026 (09/09). Cet ecran lisait `learning_resource_texts` —
                  l'import 2022, en segments aveugles de 4 000 caracteres, sans un
                  seul titre. Decision de Stef : « tout DOIT etre du 2026 ». Le
                  remplacement est ici volontairement A FORME EGALE : meme place,
                  meme geste, autre source. Afficher a la place les sections
                  PROPRES a l'acquis serait mieux, mais c'est un changement
                  d'ecran que personne n'a demande sur cette vue-la.
                */
                <ChapterTextPanel resourceId={support.id} />
              )}
            </section>
          ))
        )}
        {extra}
      </div>
    </OutcomeRow>
  );
}
