"""Assemble le paquet apprenant a partir d'un .pptx et de ses diapositives rendues.

Le paquet produit :

    course-package/
      manifest.json                 contrat de lecture (aucun nom de fichier source)
      slides/slide-001.png          rendu fidele, produit par PowerPoint
      video/slide-001.mp4           clip par diapositive (animations + videos), optionnel
      audio/slide-001.m4a           narration
      text/course.md                texte complet, lisible tel quel
      text/course.json              meme texte, structure, destine a l'IA
      player/                       lecteur autonome
      private/conversion-report.json    seul endroit ou subsistent les noms sources

Aucun octet du .pptx source ne sort d'ici : seuls les derives y figurent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".wma", ".aac"}


def natural_number(path: Path) -> int:
    matches = re.findall(r"[0-9]+", path.stem)
    if not matches:
        raise ValueError(f"Rendered slide has no numeric index: {path.name}")
    return int(matches[-1])


def slide_part(index: int) -> str:
    return f"ppt/slides/slide{index}.xml"


def rels_part(index: int) -> str:
    return f"ppt/slides/_rels/slide{index}.xml.rels"


def notes_part(index: int) -> str:
    return f"ppt/notesSlides/notesSlide{index}.xml"


def normalize_target(part: str, target: str) -> str:
    base = PurePosixPath(part).parent
    pieces: list[str] = []
    for item in (base / target).parts:
        if item == "..":
            if pieces:
                pieces.pop()
        elif item not in ("", "."):
            pieces.append(item)
    return "/".join(pieces)


def relationships(zf: zipfile.ZipFile, index: int) -> list[dict[str, str]]:
    root = ET.fromstring(zf.read(rels_part(index)))
    result = []
    for rel in root.findall("pr:Relationship", NS):
        result.append(
            {
                "id": rel.attrib.get("Id", ""),
                "type": rel.attrib.get("Type", "").rsplit("/", 1)[-1],
                "target": normalize_target(slide_part(index), rel.attrib.get("Target", "")),
            }
        )
    return result


def slide_advance_ms(xml: str) -> int | None:
    """Duree d'affichage de la diapositive, telle que PowerPoint l'a enregistree.

    C'est `advTm` sur `<p:transition>`, pose lors de l'enregistrement du
    diaporama commente. A ne surtout pas confondre avec les `dur` des noeuds
    `<p:cTn>`, qui sont les durees des EFFETS d'animation : les lire donnait
    des diapositives de 1 milliseconde.
    """
    match = re.search(r"<p:transition[^>]*\badvTm=\"([0-9]+)\"", xml)
    return int(match.group(1)) if match else None


def media_duration_ms(path: Path) -> int | None:
    """Duree reelle d'un media, via ffprobe. None si ffprobe est absent."""
    try:
        completed = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    try:
        return int(round(float(completed.stdout.strip()) * 1000))
    except ValueError:
        return None


def text_nodes(xml_bytes: bytes) -> list[str]:
    root = ET.fromstring(xml_bytes)
    return [
        node.text.strip()
        for node in root.findall(".//a:t", NS)
        if node.text and node.text.strip()
    ]


def slide_title(xml_bytes: bytes) -> str:
    texts = text_nodes(xml_bytes)
    return texts[0] if texts else ""


def notes_text(zf: zipfile.ZipFile, index: int, names: set[str]) -> str:
    part = notes_part(index)
    if part not in names:
        return ""
    pieces = [t for t in text_nodes(zf.read(part)) if not t.isdigit()]
    return " ".join(pieces).strip()


def build_outline(slides: list[dict]) -> list[dict]:
    """Sommaire : un chapitre par serie de diapositives partageant le meme titre.

    Heuristique assumee, faute de structure de sections dans le fichier source.
    Un cours dont toutes les diapositives portent un titre different produit
    donc un chapitre par diapositive : c'est voulu, mieux vaut un sommaire plat
    qu'un regroupement invente.
    """
    outline: list[dict] = []
    for slide in slides:
        title = slide["title"] or f"Diapositive {slide['index']}"
        if outline and outline[-1]["title"] == title:
            outline[-1]["slideCount"] += 1
            outline[-1]["durationMs"] += slide["durationMs"] or 0
            continue
        outline.append(
            {
                "chapterIndex": len(outline),
                "title": title,
                "startsAtSlide": slide["index"],
                "slideCount": 1,
                "durationMs": slide["durationMs"] or 0,
            }
        )
    return outline


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_text_outputs(output: Path, manifest: dict, slides_text: list[dict]) -> None:
    """Texte du cours, sous deux formes : lisible, et structuree pour l'IA."""
    text_dir = output / "text"
    text_dir.mkdir(parents=True, exist_ok=True)

    course = manifest["course"]
    lines = [f"# {course['title']}", ""]
    minutes = round((course["totalDurationMs"] or 0) / 60000, 1)
    lines.append(f"{course['slideCount']} diapositives · {minutes} min")
    lines.append("")
    lines.append("## Sommaire")
    lines.append("")
    for chapter in manifest["outline"]:
        lines.append(f"{chapter['chapterIndex'] + 1}. {chapter['title']} "
                     f"(diapositive {chapter['startsAtSlide']})")
    lines.append("")
    for item in slides_text:
        lines.append(f"## Diapositive {item['index']} — {item['title']}")
        lines.append("")
        if item["slideText"]:
            lines.append(item["slideText"])
            lines.append("")
        if item["notes"]:
            lines.append(f"Notes du presentateur : {item['notes']}")
            lines.append("")
        if item["transcript"]:
            lines.append(f"Narration : {item['transcript']}")
            lines.append("")
        elif item["hasAudio"]:
            lines.append("Narration : transcription non encore produite.")
            lines.append("")

    (text_dir / "course.md").write_text("\n".join(lines), encoding="utf-8")
    (text_dir / "course.json").write_text(
        json.dumps(
            {
                "courseId": course["id"],
                "title": course["title"],
                "outline": manifest["outline"],
                "slides": slides_text,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def build(args: argparse.Namespace) -> None:
    pptx = args.pptx.resolve()
    rendered_dir = args.rendered_dir.resolve()
    output = args.output_dir.resolve()
    player_dir = args.player_dir.resolve()
    video_dir = args.video_dir.resolve() if args.video_dir else None

    slides_dir = output / "slides"
    audio_dir = output / "audio"
    private_dir = output / "private"
    output_player = output / "player"
    output_video = output / "video"
    for directory in (slides_dir, audio_dir, private_dir, output_player):
        directory.mkdir(parents=True, exist_ok=True)

    rendered = sorted(
        [p for p in rendered_dir.iterdir()
         if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg"}],
        key=natural_number,
    )
    if not rendered:
        raise ValueError("PowerPoint produced no rendered slide images.")

    manifest_slides: list[dict] = []
    slides_text: list[dict] = []
    warnings: list[str] = []

    with zipfile.ZipFile(pptx) as zf:
        names = set(zf.namelist())
        source_slide_count = len(
            [name for name in names if re.fullmatch(r"ppt/slides/slide[0-9]+\.xml", name)]
        )
        if source_slide_count != len(rendered):
            raise ValueError(
                f"Slide count mismatch: PPTX={source_slide_count}, rendered={len(rendered)}"
            )

        for index, rendered_slide in enumerate(rendered, start=1):
            xml_bytes = zf.read(slide_part(index))
            xml = xml_bytes.decode("utf-8")
            audio_targets = sorted(
                {
                    rel["target"]
                    for rel in relationships(zf, index)
                    if PurePosixPath(rel["target"]).suffix.lower() in AUDIO_EXTENSIONS
                }
            )
            if len(audio_targets) != 1:
                warnings.append(
                    f"slide {index}: expected one unique audio track, found {len(audio_targets)}"
                )

            slide_name = f"slide-{index:03d}.png"
            shutil.copy2(rendered_slide, slides_dir / slide_name)

            audio_url = None
            audio_path = None
            if audio_targets:
                extension = PurePosixPath(audio_targets[0]).suffix.lower()
                audio_name = f"slide-{index:03d}{extension}"
                audio_path = audio_dir / audio_name
                audio_path.write_bytes(zf.read(audio_targets[0]))
                audio_url = f"audio/{audio_name}"

            # Duree : le minutage enregistre fait foi ; a defaut, la narration.
            duration = slide_advance_ms(xml)
            if duration is None and audio_path is not None:
                duration = media_duration_ms(audio_path)
                if duration is not None:
                    warnings.append(
                        f"slide {index}: no recorded slide timing, narration duration used"
                    )
            if duration is None:
                warnings.append(f"slide {index}: no slide duration available")

            video_url = None
            if video_dir is not None:
                candidate = video_dir / f"slide-{index:03d}.mp4"
                if candidate.exists():
                    output_video.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(candidate, output_video / candidate.name)
                    video_url = f"video/{candidate.name}"
                else:
                    warnings.append(f"slide {index}: no video clip found")

            title = slide_title(xml_bytes)
            texts = text_nodes(xml_bytes)
            body = " ".join(texts[1:]).strip() if len(texts) > 1 else ""
            notes = notes_text(zf, index, names)

            manifest_slides.append(
                {
                    "id": f"slide-{index:03d}",
                    "index": index,
                    "title": title,
                    "imageUrl": f"slides/{slide_name}",
                    "videoUrl": video_url,
                    "audioUrl": audio_url,
                    "durationMs": duration,
                    "transcriptUrl": None,
                }
            )
            slides_text.append(
                {
                    "index": index,
                    "title": title,
                    "slideText": body,
                    "notes": notes,
                    "transcript": "",
                    "hasAudio": audio_url is not None,
                    "hasVideo": video_url is not None,
                }
            )

    source_hash = sha256(pptx)
    outline = build_outline(manifest_slides)
    manifest = {
        "schemaVersion": "1.1",
        "course": {
            "id": f"narrated-deck-{source_hash[:12]}",
            "version": source_hash[:12],
            "title": manifest_slides[0]["title"] or "Narrated course",
            "slideCount": len(manifest_slides),
            "totalDurationMs": sum(item["durationMs"] or 0 for item in manifest_slides),
        },
        "outline": outline,
        "slides": manifest_slides,
        "capabilities": {
            "audio": all(item["audioUrl"] for item in manifest_slides),
            "video": any(item["videoUrl"] for item in manifest_slides),
            "transcript": False,
            "resume": True,
        },
    }
    write_text_outputs(output, manifest, slides_text)

    report = {
        "sourceFileName": pptx.name,
        "sourceSha256": source_hash,
        "sourceBytes": pptx.stat().st_size,
        "slideCount": len(manifest_slides),
        "warnings": warnings,
        "publicationStatus": "review_required",
    }

    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (private_dir / "conversion-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for source in player_dir.iterdir():
        if source.is_file():
            shutil.copy2(source, output_player / source.name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pptx", type=Path, required=True)
    parser.add_argument("--rendered-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--player-dir", type=Path, required=True)
    parser.add_argument("--video-dir", type=Path, default=None,
                        help="Dossier des clips par diapositive (slide-001.mp4, ...)")
    build(parser.parse_args())


if __name__ == "__main__":
    main()
