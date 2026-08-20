from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
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


def slide_duration_ms(xml: str) -> int | None:
    values = [
        int(value)
        for value in re.findall(r'<p:cTn[^>]* dur="([0-9]+)"[^>]*/>', xml)
    ]
    return max(values) if values else None


def slide_title(xml_bytes: bytes) -> str:
    root = ET.fromstring(xml_bytes)
    texts = [
        node.text.strip()
        for node in root.findall(".//a:t", NS)
        if node.text and node.text.strip()
    ]
    return texts[0] if texts else ""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(args: argparse.Namespace) -> None:
    pptx = args.pptx.resolve()
    rendered_dir = args.rendered_dir.resolve()
    output = args.output_dir.resolve()
    player_dir = args.player_dir.resolve()

    slides_dir = output / "slides"
    audio_dir = output / "audio"
    private_dir = output / "private"
    output_player = output / "player"
    for directory in (slides_dir, audio_dir, private_dir, output_player):
        directory.mkdir(parents=True, exist_ok=True)

    rendered = sorted(rendered_dir.glob("*.PNG"), key=natural_number)
    if not rendered:
        raise ValueError("PowerPoint produced no rendered slide images.")

    manifest_slides = []
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
            part = slide_part(index)
            xml_bytes = zf.read(part)
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
            if audio_targets:
                source_audio = audio_targets[0]
                extension = PurePosixPath(source_audio).suffix.lower()
                audio_name = f"slide-{index:03d}{extension}"
                (audio_dir / audio_name).write_bytes(zf.read(source_audio))
                audio_url = f"audio/{audio_name}"

            duration = slide_duration_ms(xml)
            if duration is None:
                warnings.append(f"slide {index}: no numeric PowerPoint duration")

            manifest_slides.append(
                {
                    "id": f"slide-{index:03d}",
                    "index": index,
                    "title": slide_title(xml_bytes),
                    "imageUrl": f"slides/{slide_name}",
                    "audioUrl": audio_url,
                    "durationMs": duration,
                    "transcriptUrl": None,
                }
            )

    source_hash = sha256(pptx)
    manifest = {
        "schemaVersion": "1.0",
        "course": {
            "id": f"narrated-deck-{source_hash[:12]}",
            "version": source_hash[:12],
            "title": manifest_slides[0]["title"] or "Narrated course",
            "slideCount": len(manifest_slides),
            "totalDurationMs": sum(item["durationMs"] or 0 for item in manifest_slides),
        },
        "slides": manifest_slides,
        "capabilities": {
            "audio": all(item["audioUrl"] for item in manifest_slides),
            "transcript": False,
            "resume": True,
        },
    }
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
    build(parser.parse_args())


if __name__ == "__main__":
    main()
