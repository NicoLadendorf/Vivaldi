from __future__ import annotations
from pathlib import Path
import subprocess
import shlex
import tempfile
import os

from config import Config
from omr.musicxml_parser import parse_musicxml_file, ParsedEvent

SUPPORTED_XML_EXTS = {".xml", ".musicxml", ".mxl"}

def transcribe_score(upload_path: Path, cfg: Config) -> tuple[list[ParsedEvent], dict]:
    """Transcribe an uploaded score into (type, beats, note) events.

    If file is MusicXML/MXL -> parse directly.
    If not -> try configured OMR provider (e.g., audiveris) to produce MusicXML then parse.
    Returns: (events, meta)
    """
    ext = upload_path.suffix.lower()
    meta: dict = {"provider": cfg.OMR_PROVIDER, "source_ext": ext}

    if ext in SUPPORTED_XML_EXTS:
        events = parse_musicxml_file(upload_path)
        meta["musicxml_path"] = str(upload_path)
        return events, meta

    if cfg.OMR_PROVIDER == "audiveris":
        xml_path = _run_audiveris(upload_path, cfg)
        events = parse_musicxml_file(xml_path)
        meta["musicxml_path"] = str(xml_path)
        return events, meta

    raise ValueError(
        "Uploaded file is not MusicXML/MXL, and no OMR provider is configured. "
        "Either upload .musicxml/.xml/.mxl, or set OMR_PROVIDER=audiveris and install Audiveris."
    )

def _run_audiveris(upload_path: Path, cfg: Config) -> Path:
    outdir = upload_path.parent / (upload_path.stem + "_audiveris_out")
    outdir.mkdir(parents=True, exist_ok=True)

    # Prefer explicit template if provided
    if cfg.AUDIVERIS_CMD:
        cmd = cfg.AUDIVERIS_CMD.format(input=str(upload_path), outdir=str(outdir))
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    else:
        # Try audiveris binary on PATH (standard distro provides it)
        cmd_list = ["audiveris", "-batch", "-export", "-output", str(outdir), str(upload_path)]
        proc = subprocess.run(cmd_list, capture_output=True, text=True)

    if proc.returncode != 0:
        raise RuntimeError(
            "Audiveris failed.\n"
            f"stdout:\n{proc.stdout}\n\n"
            f"stderr:\n{proc.stderr}"
        )

    # Audiveris outputs MusicXML under outdir; find newest .xml/.musicxml/.mxl
    candidates = []
    for p in outdir.rglob("*"):
        if p.suffix.lower() in (".xml", ".musicxml", ".mxl"):
            candidates.append(p)
    if not candidates:
        raise RuntimeError(f"Audiveris completed but no MusicXML found under {outdir}")
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]
