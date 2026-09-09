import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * LIRE LE TEXTE A VOIX HAUTE (demande de Stef, 09/09).
 *
 * `speechSynthesis` — LA VOIX DU NAVIGATEUR, PAS UN SERVICE. Aucun appel
 * reseau, aucun cout, aucune cle : la synthese se fait sur l'appareil, hors
 * ligne, et fonctionne sur l'iPhone comme sur le poste du CHU. C'est ce qui la
 * rend utilisable sur 1,3 million de caracteres de referentiel, la ou un
 * service factur au caractere serait hors de question — et c'est le choix
 * explicite de Stef contre ElevenLabs, deja utilise pour les diaporamas narres
 * (qui, eux, sont pre-generes une fois).
 *
 * CE QU'ON N'A PAS : le controle de la voix. Elle vient du systeme, correcte
 * sur iOS et macOS, tres variable ailleurs, et les sigles medicaux (ECG, AOMI,
 * mmHg) passeront mal. C'est un confort de revision, jamais un cours audio.
 *
 * TROIS PIEGES DE LA WEB SPEECH API, tous rencontres ailleurs et tous traites
 * ici plutot que decouverts en production :
 *
 *   1. LES VOIX ARRIVENT DE FACON ASYNCHRONE. `getVoices()` rend souvent un
 *      tableau vide au premier appel ; il faut attendre `voiceschanged`. On ne
 *      bloque pas la lecture pour autant : sans voix francaise identifiee, le
 *      moteur choisit lui-meme d'apres `lang`.
 *   2. SAFARI S'ARRETE TOUT SEUL apres une quinzaine de secondes sur un long
 *      enonce. La parade connue est un `resume()` periodique tant qu'on parle.
 *   3. UN ENONCE TROP LONG EST TRONQUE EN SILENCE par plusieurs moteurs. On
 *      decoupe donc par blocs — ce qui tombe bien, le texte 2026 est deja fait
 *      de sections.
 *
 * ET ON ARRETE EN QUITTANT. La synthese vit dans `window`, pas dans le
 * composant : sans le nettoyage au demontage, refermer un chapitre laisserait
 * une voix continuer a lire un texte que plus personne n'a sous les yeux.
 */

/** Au-dela, plusieurs moteurs tronquent sans rien dire. Mesure prudente. */
const TAILLE_BLOC = 600;

function decouper(textes: readonly string[]): string[] {
  const blocs: string[] = [];
  for (const texte of textes) {
    const propre = texte.trim();
    if (propre === "") continue;
    if (propre.length <= TAILLE_BLOC) {
      blocs.push(propre);
      continue;
    }
    /*
     * ON COUPE SUR UNE FIN DE PHRASE quand il y en a une : une coupure au
     * milieu d'une phrase s'entend, et sur du texte medical elle peut separer
     * un chiffre de son unite.
     */
    let reste = propre;
    while (reste.length > TAILLE_BLOC) {
      const fenetre = reste.slice(0, TAILLE_BLOC);
      const dernierPoint = Math.max(
        fenetre.lastIndexOf(". "),
        fenetre.lastIndexOf(" ; "),
        fenetre.lastIndexOf("\n"),
      );
      const coupe = dernierPoint > TAILLE_BLOC / 3 ? dernierPoint + 1 : TAILLE_BLOC;
      blocs.push(reste.slice(0, coupe).trim());
      reste = reste.slice(coupe);
    }
    if (reste.trim() !== "") blocs.push(reste.trim());
  }
  return blocs;
}

type Etat = "arret" | "lecture" | "pause";

export function ReadAloudButton({ textes }: { readonly textes: readonly string[] }) {
  const [etat, setEtat] = useState<Etat>("arret");
  const voixRef = useRef<SpeechSynthesisVoice | null>(null);
  const relanceRef = useRef<number | null>(null);

  const disponible =
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

  // Piege n°1 : les voix arrivent apres coup.
  useEffect(() => {
    if (!disponible) return;
    const choisir = () => {
      const voix = window.speechSynthesis.getVoices();
      voixRef.current = voix.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
    };
    choisir();
    window.speechSynthesis.addEventListener("voiceschanged", choisir);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", choisir);
  }, [disponible]);

  const arreter = useCallback(() => {
    if (!disponible) return;
    if (relanceRef.current !== null) {
      window.clearInterval(relanceRef.current);
      relanceRef.current = null;
    }
    window.speechSynthesis.cancel();
    setEtat("arret");
  }, [disponible]);

  // On ne laisse jamais une voix survivre a l'ecran qu'elle lit.
  useEffect(() => arreter, [arreter]);

  if (!disponible) return null;

  const lire = () => {
    const blocs = decouper(textes);
    if (blocs.length === 0) return;
    window.speechSynthesis.cancel();

    blocs.forEach((bloc, index) => {
      const enonce = new SpeechSynthesisUtterance(bloc);
      enonce.lang = "fr-FR";
      if (voixRef.current) enonce.voice = voixRef.current;
      enonce.rate = 1;
      if (index === blocs.length - 1) {
        enonce.onend = () => arreter();
      }
      window.speechSynthesis.speak(enonce);
    });

    // Piege n°2 : Safari s'interrompt seul sur les longs enonces.
    relanceRef.current = window.setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 8000);
    setEtat("lecture");
  };

  const basculerPause = () => {
    if (etat === "lecture") {
      window.speechSynthesis.pause();
      setEtat("pause");
    } else {
      window.speechSynthesis.resume();
      setEtat("lecture");
    }
  };

  if (etat === "arret") {
    return (
      <Button variant="outline" size="sm" className="min-h-9 gap-1.5" onClick={lire}>
        <Play className="size-3.5" aria-hidden />
        Écouter
      </Button>
    );
  }

  return (
    <span className="inline-flex gap-1.5">
      <Button variant="outline" size="sm" className="min-h-9 gap-1.5" onClick={basculerPause}>
        {etat === "lecture" ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {etat === "lecture" ? "Pause" : "Reprendre"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-9 gap-1.5"
        onClick={arreter}
        aria-label="Arrêter la lecture"
      >
        <Square className="size-3.5" aria-hidden />
        Arrêter
      </Button>
    </span>
  );
}
