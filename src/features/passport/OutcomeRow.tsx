import { useEffect, useRef, type ReactNode } from "react";
import { BookOpen, Check, PlayCircle } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { MasteryLevel, Outcome } from "@/domain/types";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import { OutcomeDeclarationSwitch } from "@/features/passport/OutcomeDeclarationSwitch";

/**
 * LA LIGNE D'UN ACQUIS, identique dans « Mes ressources » et « Mes compétences ».
 *
 * Stef a validé cette mise en page sur les connaissances le 03/09 et demandé la
 * même sur les compétences. La partager plutôt que la recopier n'est pas une
 * coquetterie : c'est la règle du dépôt — une entité, deux portes d'entrée, la
 * même projection. Deux copies auraient divergé au premier ajustement.
 *
 * TROIS ÉLÉMENTS, TOUJOURS DANS CET ORDRE : l'interrupteur de déclaration à
 * gauche, hors du bouton d'accordéon ; l'intitulé, qui EST le bouton — on appuie
 * dessus et le contenu s'ouvre ; le contenu, chargé seulement à l'ouverture.
 *
 * L'interrupteur est en dehors du bouton parce qu'un contrôle imbriqué dans un
 * bouton n'est pas activable au clavier, et parce qu'on doit pouvoir cocher une
 * ligne sans déplier ce qu'elle contient.
 */
export function OutcomeRow({
  outcome,
  declaredLevel,
  badges,
  supportCount,
  supportKind,
  spotlight = false,
  open,
  onOpenChange,
  children,
}: {
  readonly outcome: Outcome;
  readonly declaredLevel?: MasteryLevel;
  /** Étiquettes affichées à la suite de l'intitulé, sur la ligne fermée. */
  readonly badges?: ReactNode;
  /**
   * Nombre de supports pédagogiques derrière cette ligne. Zéro = aucune
   * pastille : promettre un contenu absent est pire que ne rien promettre.
   */
  readonly supportCount?: number;
  /** Vidéo si au moins un support en est une, texte sinon. */
  readonly supportKind?: "video" | "text";
  /**
   * VRAI quand on ARRIVE SUR CETTE LIGNE depuis un lien (Vue d'ensemble →
   * « Mon prochain jalon »). Elle s'ouvre alors d'elle-même, se signale, et
   * l'écran défile jusqu'à elle. Sans cela, un lien profond déposait
   * l'étudiant en haut d'un écran de 368 lignes : il avait changé de page
   * sans être arrivé nulle part.
   */
  readonly spotlight?: boolean;
  /**
   * PILOTAGE EXTERNE, optionnel. Sans ces deux propriétés la ligne garde son
   * comportement d'origine : chacune s'ouvre et se ferme pour son compte. Les
   * fournir laisse la LISTE décider — c'est ce qui permet de n'avoir qu'un seul
   * acquis ouvert à la fois, sans quoi la page devient interminable sur
   * téléphone.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Ce que l'ouverture révèle : contenus, échéances, journal. */
  readonly children: ReactNode;
}) {
  /*
   * On défile APRÈS la peinture (`requestAnimationFrame`) : avant, la ligne
   * n'a pas encore sa hauteur ouverte et le navigateur viserait à côté.
   */
  const ancre = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!spotlight) return;
    const trame = window.requestAnimationFrame(() => {
      ancre.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(trame);
  }, [spotlight]);
  /**
   * LES INDICATEURS DE CONTENU, EN TRAIT (07/09).
   *
   * CE QU'ILS REMPLACENT : une pastille marine pleine, qui attirait l'oeil plus
   * fort que l'enonce lui-meme. Or l'enonce est ce que l'etudiant doit lire ;
   * le contenu derriere n'est qu'une promesse secondaire.
   *
   * TROIS REGLES QUI TIENNENT LE BRUIT :
   *   - le CHIFFRE n'apparait qu'a partir de DEUX. « 1 » n'apprend rien que la
   *     presence de l'icone ne dise deja ;
   *   - un type absent est RETIRE, jamais grise. Quatre icones dont trois
   *     eteintes font plus de bruit qu'une seule allumee ;
   *   - chaque icone porte son libelle en toutes lettres pour les lecteurs
   *     d'ecran — une icone muette n'existe pas pour eux.
   *
   * ON N'AFFICHE QUE CE QUI EXISTE VRAIMENT AU NIVEAU DE L'ACQUIS. Figures et
   * videos pendent au SUPPORT (verifie dans le schema le 07/09 : aucune de ces
   * tables ne porte d'`outcome_id`) et vivent au niveau du chapitre. En mettre
   * le compte sur chaque ligne repeterait quinze fois le meme chiffre.
   */
  const Icone = supportKind === "video" ? PlayCircle : BookOpen;
  const indicateurs =
    supportCount && supportCount > 0 ? (
      <span
        className="ms-2 inline-flex shrink-0 items-center gap-1 align-middle text-muted-foreground"
        title={
          supportKind === "video"
            ? `${supportCount} vidéo(s)`
            : `${supportCount} support(s) de cours`
        }
      >
        <Icone className="size-3.5" aria-hidden />
        {supportCount > 1 ? (
          <span className="text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
            {supportCount}
          </span>
        ) : null}
        <span className="sr-only">
          {supportCount} {supportKind === "video" ? "vidéo" : "support de cours"}
          {supportCount > 1 ? "s" : ""}
        </span>
      </span>
    ) : null;

  /**
   * L'INDICATEUR D'ETAT A SA PLACE RESERVEE, A DROITE. Il vivait a cote de
   * l'interrupteur, DANS LE FLUX : une ligne declaree decalait son enonce vers
   * la droite et plus rien ne s'alignait. La colonne de gauche ne porte donc
   * plus que l'interrupteur, de largeur fixe, et tous les enonces demarrent sur
   * la meme verticale, declares ou non.
   */
  const declare = declaredLevel !== undefined && declaredLevel !== "not_started";

  return (
    <li
      ref={ancre}
      id={`acquis-${outcome.code}`}
      className={cn(
        "border-b border-border last:border-0",
        spotlight ? "rounded-md bg-primary/5 ring-2 ring-primary/50" : null,
      )}
    >
      {/*
        LA GRILLE DU DEPLIE EST CELLE DU REPLIE (defaut releve par Stef le
        07/09). L'accordeon enveloppait AUSSI le contenu dans la colonne de
        droite : une fois ouvert, le texte et les boutons se tassaient dans une
        colonne etroite pendant qu'une grande zone vide s'etendait sous
        l'interrupteur. L'accordeon enveloppe donc maintenant TOUTE la ligne, et
        seul son DECLENCHEUR partage l'espace avec l'interrupteur. Le contenu
        deplie prend la pleine largeur, en dessous.
      */}
      <Accordion
        type="single"
        collapsible
        className="w-full"
        {...(open === undefined
          ? spotlight
            ? { defaultValue: "contenu" }
            : {}
          : {
              value: open ? "contenu" : "",
              onValueChange: (v: string) => onOpenChange?.(v === "contenu"),
            })}
      >
        <AccordionItem value="contenu" className="border-b-0">
          <div className="flex items-center gap-3 py-1">
            <div className="flex w-9 shrink-0 items-center">
              <OutcomeDeclarationSwitch
                outcomeId={outcome.id}
                label={outcome.label}
                nature={outcome.nature}
                targetMastery={outcome.targetMastery}
                showBadge={false}
                {...(declaredLevel === undefined ? {} : { declaredLevel })}
              />
            </div>
            <AccordionTrigger className="min-w-0 flex-1 py-2 text-left">
              <span className="min-w-0 flex-1 pr-2 text-sm">
                <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                {indicateurs}
                {declare ? (
                  <span
                    className="ms-2 inline-flex shrink-0 items-center gap-1 align-middle text-xs font-medium text-success"
                    title={`Déclaré au niveau ${MASTERY_LABELS_FR[outcome.targetMastery]}${
                      outcome.nature === "real_competence" ? " · à faire valider" : ""
                    }`}
                  >
                    <Check className="size-3.5" aria-hidden />
                    Déclaré
                  </span>
                ) : null}
                {badges}
              </span>
            </AccordionTrigger>
          </div>
          <AccordionContent className="pb-4">{children}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </li>
  );
}
