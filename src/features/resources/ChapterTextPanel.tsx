import { useQuery } from "@tanstack/react-query";

import { useDataAccess } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseSectionsText } from "@/features/resources/CourseSectionsText";
import { entreesDuPlan } from "@/domain/courseSections";
import type { LearningResourceId } from "@/domain/types";

/**
 * LE TEXTE INTEGRAL D'UN CHAPITRE, edition 2026.
 *
 * REMPLACE `ResourceTextPanel`, qui lisait `learning_resource_texts` — l'import
 * de 2022, decoupe en segments AVEUGLES de 4 000 caracteres, sans un seul
 * titre, parce que la structure du cours avait ete detruite a l'import et
 * n'etait pas reconstituable. Decision de Stef, 09/09 : « tout DOIT etre du
 * 2026 ». L'ancienne table reste en base comme archive de l'import 2022.
 *
 * CHARGE A L'OUVERTURE, PAS AVANT. Un chapitre pese des dizaines de milliers de
 * caracteres — jusqu'a 123 512 pour le plus gros ; charger les vingt-trois a
 * l'affichage de la page ferait payer a l'etudiant un contenu qu'il n'a pas
 * demande. La requete part quand il deplie, et react-query la garde ensuite.
 *
 * `entreesDuPlan` ECARTE LES ENCADRES du compte annonce, pas du texte : un
 * « Pour comprendre » se lit DANS sa section hote et n'est pas une entree du
 * sommaire. Le compte doit dire la meme chose que le livre.
 */
export function ChapterTextPanel({ resourceId }: { resourceId: LearningResourceId }) {
  const data = useDataAccess();
  const {
    data: sections,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["chapter-sections", resourceId],
    queryFn: () => data.resources.readChapterSections(resourceId),
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) return <p className="text-destructive text-sm">Contenu momentanément illisible.</p>;
  if (!sections || sections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Le texte de ce chapitre n'est pas encore enregistré.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {entreesDuPlan(sections).length} section(s) — texte intégral, édition 2026.
      </p>
      <CourseSectionsText sections={sections} />
    </div>
  );
}
