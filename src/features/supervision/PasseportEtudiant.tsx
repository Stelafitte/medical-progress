/**
 * LE PASSEPORT D'UN ETUDIANT, VU PAR LE RESPONSABLE DE STAGE (11/09).
 *
 * POURQUOI IL EXISTE. Le bilan donnait quatre chiffres. On ne prononce pas la
 * validation d'un stage sur quatre chiffres : il faut pouvoir entrer dans le
 * détail — quelles compétences sont confirmées, lesquelles restent déclarées
 * sans l'être, quels chapitres de connaissances n'ont jamais été ouverts.
 *
 * LA MEME GRAMMAIRE QUE LES DEUX ONGLETS : une barre par chapitre pour la vue
 * d'ensemble, les pastilles pour le détail. On ne réapprend pas à lire en
 * changeant d'écran.
 *
 * ⚠️ LES CHAPITRES SONT FERMES AU DEPART. Un passeport de DFASM-CARDIO porte
 * 64 compétences et 331 connaissances : tout déplier ferait de ce panneau la
 * page interminable qu'on vient justement de retirer du bilan.
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  ProgressionDot,
  libelleEtat,
  type EtatAcquis,
} from "@/features/supervision/ProgressionDot";
import {
  BarreDeGroupe,
  libelleRepartition,
  repartitionDuGroupe,
} from "@/features/supervision/BarreDeGroupe";
import type { GroupeDeMatrice } from "@/features/supervision/ProgressionMatrix";

export function PasseportEtudiant({
  nom,
  groupes,
  etat,
  onCase,
  enCours,
  vide,
}: {
  nom: string;
  groupes: readonly GroupeDeMatrice[];
  etat: (outcomeId: string) => EtatAcquis;
  /** Présent pour les compétences : cliquer une pastille confirme ou retire. */
  onCase?: ((outcomeId: string, etat: EtatAcquis) => void) | undefined;
  enCours?: boolean | undefined;
  vide: string;
}) {
  if (groupes.length === 0) return <p className="text-muted-foreground text-sm">{vide}</p>;

  return (
    <Accordion type="multiple" className="divide-border divide-y">
      {groupes.map((g) => {
        const r = repartitionDuGroupe(
          g.acquis.map((o) => o.id),
          (id) => etat(id).niveau,
        );
        return (
          <AccordionItem key={g.id} value={g.id} className="border-0">
            <AccordionTrigger className="gap-3 py-2 text-start text-sm hover:no-underline">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <BarreDeGroupe
                  repartition={r}
                  largeur={72}
                  titre={libelleRepartition(nom, g.label, r)}
                />
                <span className="min-w-0 truncate">{g.label}</span>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {r.total - r.sansDeclaration}/{r.total}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <ul className="space-y-1.5">
                {g.acquis.map((o) => {
                  const courant = etat(o.id);
                  return (
                    <li key={o.id} className="flex items-start gap-2.5 text-sm leading-snug">
                      <span className="pt-0.5">
                        <ProgressionDot
                          etat={courant}
                          titre={libelleEtat(courant, nom, `${o.code} ${o.label}`)}
                          disabled={enCours}
                          onClick={
                            onCase && courant.niveau !== undefined
                              ? () => onCase(o.id, courant)
                              : undefined
                          }
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="text-muted-foreground font-mono text-[12px]">
                          {o.code}
                        </span>{" "}
                        {o.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
