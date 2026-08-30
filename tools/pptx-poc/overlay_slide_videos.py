"""Rend leur mouvement aux vidéos incrustées dans les diapositives.

PowerPoint exporte fidèlement les animations, mais pas les vidéos incrustées :
selon leur réglage de lecture, elles apparaissent puis restent figées sur une
image. Le cours converti perd alors ce qui compte le plus — la boucle
d'échocardiographie elle-même.

Ce script remet la vraie vidéo par-dessus le clip, à l'endroit exact où elle se
trouve sur la diapositive, et en boucle jusqu'à la fin de celle-ci.

Le moment d'apparition n'est écrit nulle part dans le .pptx quand la vidéo est
déclenchée par un clic. Il est en revanche visible dans la vidéo exportée : le
rectangle de la vidéo est immobile, puis change d'un coup. C'est ce changement
qu'on détecte, ce qui préserve exactement le minutage voulu par l'auteur.

    python3 overlay_slide_videos.py --pptx cours.pptx --package course-package/
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".wmv", ".m4v", ".mkv", ".webm"}
# Sensibilité de la détection : l'apparition d'une image dans un rectangle
# jusque-là immobile produit un écart bien supérieur.
CHANGE_THRESHOLD = 10
SAMPLES_PER_SECOND = 4


def run(command: list[str]) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr.decode("utf-8", "replace")[-1500:])
        raise SystemExit(f"ffmpeg a echoue : {' '.join(command[:8])} ...")
    return result


def slide_video(
    zf: zipfile.ZipFile, index: int
) -> tuple[str, tuple[float, float, float, float], tuple[float, float]] | None:
    """Fichier vidéo de la diapositive, son rectangle et son rognage.

    Le rectangle est exprimé en fractions de la diapositive, indépendamment de
    la résolution du rendu.

    Le rognage vient de `<p14:trim st="..." end="..."/>` : deux durées en
    millisecondes, RETRANCHÉES l'une au début et l'autre à la fin du fichier
    source — `end` n'est pas un instant de fin absolu. L'auteur ne monte pas
    ses vidéos avant de les insérer, il les rogne dans PowerPoint ; ignorer ce
    rognage rejouerait des secondes qu'il a explicitement écartées.
    """
    rels_name = f"ppt/slides/_rels/slide{index}.xml.rels"
    if rels_name not in zf.namelist():
        return None
    rels = zf.read(rels_name).decode("utf-8", "replace")
    targets = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

    presentation = zf.read("ppt/presentation.xml").decode("utf-8", "replace")
    size = re.search(r'<p:sldSz cx="(\d+)" cy="(\d+)"', presentation)
    if not size:
        return None
    slide_w, slide_h = int(size.group(1)), int(size.group(2))

    xml = zf.read(f"ppt/slides/slide{index}.xml").decode("utf-8", "replace")
    for pic in re.finditer(r"<p:pic>(.*?)</p:pic>", xml, re.S):
        block = pic.group(1)
        media = None
        for rel_id in re.findall(
            r'<(?:a:videoFile|p14:media)[^>]*r:(?:link|embed)="([^"]+)"', block
        ):
            target = targets.get(rel_id, "")
            if PurePosixPath(target).suffix.lower() in VIDEO_EXTENSIONS:
                media = "ppt/media/" + PurePosixPath(target).name
                break
        if not media:
            continue
        off = re.search(r'<a:off x="(-?\d+)" y="(-?\d+)"/>', block)
        ext = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"/>', block)
        if not off or not ext:
            continue
        trim = re.search(r'<p14:trim([^>]*)/>', block)
        trim_start = trim_end = 0.0
        if trim:
            attrs = trim.group(1)
            st = re.search(r'\bst="(\d+)"', attrs)
            en = re.search(r'\bend="(\d+)"', attrs)
            trim_start = int(st.group(1)) / 1000 if st else 0.0
            trim_end = int(en.group(1)) / 1000 if en else 0.0
        return (
            media,
            (
                int(off.group(1)) / slide_w,
                int(off.group(2)) / slide_h,
                int(ext.group(1)) / slide_w,
                int(ext.group(2)) / slide_h,
            ),
            (trim_start, trim_end),
        )
    return None


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def clip_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    width, height = out.split("x")
    return int(width), int(height)


def appearance_seconds(clip: Path, rect_px: tuple[int, int, int, int]) -> float:
    """Instant où le rectangle de la vidéo cesse d'être identique à son état initial."""
    x, y, w, h = rect_px
    raw = run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(clip),
               "-vf", f"crop={w}:{h}:{x}:{y},fps={SAMPLES_PER_SECOND},scale=32:16,format=gray",
               "-f", "rawvideo", "-"]).stdout
    frame = 32 * 16
    frames = [raw[i:i + frame] for i in range(0, len(raw) - frame + 1, frame)]
    if not frames:
        return 0.0
    base = frames[0]
    for position, sample in enumerate(frames):
        delta = sum(abs(a - b) for a, b in zip(base, sample)) / frame
        if delta > CHANGE_THRESHOLD:
            return position / SAMPLES_PER_SECOND
    # Rectangle immobile de bout en bout : la vidéo est déjà là, figée.
    return 0.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pptx", type=Path, required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--crf", type=int, default=23)
    args = parser.parse_args()

    video_dir = args.package / "video"
    if not video_dir.is_dir():
        raise SystemExit(f"Aucun dossier video dans {args.package} : rien a reincruster.")

    treated = 0
    with zipfile.ZipFile(args.pptx) as zf, tempfile.TemporaryDirectory() as tmp:
        temp = Path(tmp)
        clips = sorted(video_dir.glob("slide-*.mp4"))
        for clip in clips:
            index = int(re.findall(r"(\d+)", clip.stem)[-1])
            found = slide_video(zf, index)
            if not found:
                continue
            media_path, (rx, ry, rw, rh), (trim_start, trim_end) = found

            width, height = clip_size(clip)
            # Dimensions paires : libx264 refuse les tailles impaires.
            rect = (
                round(rx * width) // 2 * 2,
                round(ry * height) // 2 * 2,
                round(rw * width) // 2 * 2,
                round(rh * height) // 2 * 2,
            )
            start = appearance_seconds(clip, rect)

            source = temp / Path(media_path).name
            source.write_bytes(zf.read(media_path))

            # Rognage : on coupe avant l'encodage, pour que la boucle rejoue
            # exactement le passage retenu par l'auteur.
            cut: list[str] = []
            trimmed = ""
            if trim_start or trim_end:
                full = probe_duration(source)
                keep_from = trim_start
                keep_to = max(full - trim_end, keep_from)
                cut = ["-ss", f"{keep_from:.3f}", "-to", f"{keep_to:.3f}"]
                trimmed = f", rogne {keep_from:.2f}-{keep_to:.2f} s sur {full:.2f} s"

            overlay = temp / f"overlay-{index:03d}.mp4"
            run(["ffmpeg", "-nostdin", "-v", "error", "-y", *cut, "-i", str(source),
                 "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", str(args.crf),
                 "-pix_fmt", "yuv420p", "-vf", f"scale={rect[2]}:{rect[3]}", str(overlay)])

            merged = temp / f"merged-{index:03d}.mp4"
            run(["ffmpeg", "-nostdin", "-v", "error", "-y",
                 "-i", str(clip), "-stream_loop", "-1", "-i", str(overlay),
                 "-filter_complex",
                 f"[1:v]setpts=PTS-STARTPTS+{start}/TB[ov];"
                 f"[0:v][ov]overlay={rect[0]}:{rect[1]}:enable='gte(t,{start})':eof_action=pass[out]",
                 "-map", "[out]", "-map", "0:a?",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", str(args.crf),
                 "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest",
                 "-movflags", "+faststart", str(merged)])
            shutil.move(str(merged), str(clip))
            treated += 1
            print(f"  diapo {index:>2} : {Path(media_path).name} reincrustee en boucle "
                  f"a partir de {start:.2f} s{trimmed}  "
                  f"({clip.stat().st_size / 1_048_576:.2f} Mo)")

    if treated == 0:
        print("Aucune diapositive ne porte de video incrustee.")
    else:
        print(f"{treated} clip(s) corrige(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
