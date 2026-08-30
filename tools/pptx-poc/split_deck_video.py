"""Decoupe la video du diaporama en un clip par diapositive.

PowerPoint sait exporter un diaporama commente en une video unique, et lui seul
sait le faire fidelement : animations, boucles video incluses dans les
diapositives, transitions et narration y sont exactement telles que l'auteur
les a montees. Ce script reprend cette video et la coupe aux frontieres de
diapositive, pour obtenir le clip et l'image de couverture de chacune.

Les frontieres viennent des minutages enregistres (`advTm`) lus dans le .pptx.
La somme de ces minutages ne tombe jamais parfaitement sur la duree du fichier
produit (transitions, arrondis de la derniere image) : l'ecart est mesure puis
reparti proportionnellement, ce qui evite la derive cumulative.

    python3 split_deck_video.py --pptx cours.pptx --video deck.mp4 --out-dir derives/
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import zipfile
from pathlib import Path

# Au-dela de cet ecart relatif entre minutages et video, on refuse de couper :
# quelque chose ne correspond pas, et decouper produirait un cours desynchronise.
MAX_DRIFT_RATIO = 0.10


def slide_advance_seconds(pptx: Path) -> list[float]:
    durations: list[float] = []
    with zipfile.ZipFile(pptx) as zf:
        names = zf.namelist()
        count = len([n for n in names if re.fullmatch(r"ppt/slides/slide[0-9]+\.xml", n)])
        for index in range(1, count + 1):
            xml = zf.read(f"ppt/slides/slide{index}.xml").decode("utf-8", "replace")
            match = re.search(r"<p:transition[^>]*\badvTm=\"([0-9]+)\"", xml)
            if not match:
                raise SystemExit(
                    f"Diapositive {index} : aucun minutage enregistre (advTm).\n"
                    "Ce diaporama n'a pas de minutages : PowerPoint ne peut pas en "
                    "produire une video synchronisee, et le decoupage serait faux."
                )
            durations.append(int(match.group(1)) / 1000)
    return durations


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr[-2000:])
        raise SystemExit(f"ffmpeg a echoue : {' '.join(command[:6])} ...")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pptx", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--crf", type=int, default=23)
    parser.add_argument("--resume", action="store_true",
                        help="Repasser sur un decoupage interrompu sans refaire les clips deja corrects")
    args = parser.parse_args()

    durations = slide_advance_seconds(args.pptx)
    expected = sum(durations)
    actual = probe_duration(args.video)
    drift = abs(actual - expected) / expected if expected else 1.0

    print(f"Diapositives      : {len(durations)}")
    print(f"Somme des minutages : {expected:.1f} s")
    print(f"Video produite      : {actual:.1f} s  (ecart {drift * 100:.1f} %)")
    if drift > MAX_DRIFT_RATIO:
        raise SystemExit(
            "Ecart trop important entre les minutages et la video : decoupage refuse.\n"
            "Verifier que la video a bien ete exportee avec les minutages et la narration."
        )
    scale = actual / expected if expected else 1.0

    clips_dir = args.out_dir / "video"
    posters_dir = args.out_dir / "posters"
    clips_dir.mkdir(parents=True, exist_ok=True)
    posters_dir.mkdir(parents=True, exist_ok=True)

    start = 0.0
    for index, duration in enumerate(durations, start=1):
        scaled_start = start * scale
        scaled_duration = duration * scale
        clip = clips_dir / f"slide-{index:03d}.mp4"
        poster = posters_dir / f"slide-{index:03d}.png"

        # Reprise : un clip n'est reutilise que si sa duree correspond a ce
        # qu'on attend. Un fichier laisse a moitie ecrit par une interruption
        # est donc refait, jamais garde.
        if args.resume and clip.exists() and poster.exists():
            try:
                if abs(probe_duration(clip) - scaled_duration) < 0.5:
                    print(f"  diapo {index:>2} : deja fait, conserve")
                    start += duration
                    continue
            except (subprocess.CalledProcessError, ValueError):
                pass

        # -ss avant -i : PowerPoint produit des images cles frequentes, et la
        # precision au dixieme suffit pour une frontiere de diapositive.
        run(["ffmpeg", "-nostdin", "-v", "error", "-y",
             "-ss", f"{scaled_start:.3f}", "-i", str(args.video),
             "-t", f"{scaled_duration:.3f}",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", str(args.crf),
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
             "-movflags", "+faststart", str(clip)])

        # Couverture prise un peu apres le debut : sur une diapositive animee,
        # la premiere image est souvent vide.
        offset = scaled_start + min(1.0, scaled_duration / 3)
        run(["ffmpeg", "-nostdin", "-v", "error", "-y",
             "-ss", f"{offset:.3f}", "-i", str(args.video),
             "-frames:v", "1", str(poster)])

        print(f"  diapo {index:>2} : {scaled_duration:6.1f} s  "
              f"{clip.stat().st_size / 1_048_576:6.2f} Mo")
        start += duration

    total = sum(p.stat().st_size for p in clips_dir.iterdir())
    print(f"Total des clips   : {total / 1_048_576:.1f} Mo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
