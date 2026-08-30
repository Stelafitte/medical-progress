"""Mesure ce qu'un .pptx contient reellement, diapositive par diapositive.

Repond a une seule question : quelle part du diaporama survivrait a une
conversion en images fixes ? Une diapositive qui porte une video ou une
animation reelle perd quelque chose ; les autres, non.

Lecture seule, aucune dependance externe, rien n'est ecrit ni envoye.

    python3 analyze_deck.py "chemin/vers/cours.pptx"
"""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

VIDEO_EXT = {".mp4", ".mov", ".avi", ".wmv", ".m4v", ".mkv", ".webm", ".mpg", ".mpeg"}
AUDIO_EXT = {".mp3", ".m4a", ".wav", ".wma", ".aac", ".oga", ".ogg"}

# Noeuds d'animation reels. <p:timing> seul ne compte pas : PowerPoint l'ecrit
# sur presque toutes les diapositives, meme sans aucune animation.
ANIM_NODES = ("p:animEffect", "p:animMotion", "p:animRot", "p:animScale",
              "p:animClr", "p:bldP", "p:bldOleChart", "p:bldGraphic")
ANIM_RE = re.compile(r"<(?:" + "|".join(n.replace(":", r"\:") for n in ANIM_NODES) + r")\b")
ANIM_PLAIN_RE = re.compile(r"<p:anim\b")
TRANSITION_RE = re.compile(r"<p:transition\b")


def slide_number(name: str) -> int:
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def main(path: Path) -> int:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        slides = sorted(
            (n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
            key=slide_number,
        )
        if not slides:
            print("Aucune diapositive trouvee dans ce paquet.")
            return 1

        media = [n for n in names if n.startswith("ppt/media/")]
        videos_in_package = [n for n in media if Path(n).suffix.lower() in VIDEO_EXT]
        audios_in_package = [n for n in media if Path(n).suffix.lower() in AUDIO_EXT]

        rows = []
        for slide in slides:
            xml = archive.read(slide).decode("utf-8", "replace")
            rels_name = f"ppt/slides/_rels/{Path(slide).name}.rels"
            rels = archive.read(rels_name).decode("utf-8", "replace") if rels_name in names else ""

            targets = re.findall(r'Target="([^"]+)"', rels)
            suffixes = {Path(t.split("?")[0]).suffix.lower() for t in targets}
            has_video = bool(suffixes & VIDEO_EXT) or "<a:videoFile" in xml
            has_audio = bool(suffixes & AUDIO_EXT)
            has_link = any(t.startswith(("http://", "https://")) and
                           any(k in t.lower() for k in ("youtu", "vimeo", "video"))
                           for t in targets)

            anim_hits = len(ANIM_RE.findall(xml)) + len(ANIM_PLAIN_RE.findall(xml))
            rows.append({
                "n": slide_number(slide),
                "video": has_video or has_link,
                "audio": has_audio,
                "anim": anim_hits,
                "transition": bool(TRANSITION_RE.search(xml)),
            })

    total = len(rows)
    with_video = [r for r in rows if r["video"]]
    with_anim = [r for r in rows if r["anim"] > 0]
    with_audio = [r for r in rows if r["audio"]]
    lossy = [r for r in rows if r["video"] or r["anim"] > 0]

    def listing(items):
        nums = [str(r["n"]) for r in items]
        return ", ".join(nums[:25]) + (" ..." if len(nums) > 25 else "")

    print(f"Fichier          : {path.name}  ({path.stat().st_size / 1_048_576:.1f} Mo)")
    print(f"Diapositives     : {total}")
    print(f"Avec narration   : {len(with_audio):>3}  {listing(with_audio)}")
    print(f"Avec video       : {len(with_video):>3}  {listing(with_video)}")
    print(f"Avec animation   : {len(with_anim):>3}  {listing(with_anim)}")
    print(f"Transitions      : {sum(1 for r in rows if r['transition'])}")
    print()
    print(f"=> {len(lossy)} diapositive(s) sur {total} "
          f"({len(lossy) * 100 // max(total, 1)} %) perdraient quelque chose "
          f"en conversion vers une image fixe.")
    print(f"=> {total - len(lossy)} passeraient sans perte.")
    print()
    print(f"Medias embarques : {len(videos_in_package)} video(s), "
          f"{len(audios_in_package)} piste(s) audio")
    if with_anim:
        worst = sorted(with_anim, key=lambda r: -r["anim"])[:5]
        print("Diapositives les plus animees : "
              + ", ".join(f"n°{r['n']} ({r['anim']} effets)" for r in worst))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(Path(sys.argv[1])))
