from __future__ import annotations
from dataclasses import dataclass
from typing import Iterator
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

# MusicXML namespace handling
def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag

def _find_first(root: ET.Element, name: str) -> ET.Element | None:
    for el in root.iter():
        if _strip_ns(el.tag) == name:
            return el
    return None

@dataclass
class ParsedEvent:
    type: str  # "N" | "R"
    beats: float
    note: str | None

def _pitch_to_note(step: str, alter: int | None, octave: int) -> str:
    # Use sharps for alter=+1, flats for alter=-1
    acc = ""
    if alter == 1:
        acc = "#"
    elif alter == -1:
        acc = "b"
    elif alter and alter != 0:
        # rare: double-sharp/flat
        acc = "#" * alter if alter > 0 else "b" * (-alter)
    return f"{step.upper()}{acc}{octave}"

def _get_divisions(measure_or_root: ET.Element) -> int | None:
    # divisions may appear in <attributes>
    for attr in measure_or_root.iter():
        if _strip_ns(attr.tag) == "attributes":
            for d in list(attr):
                if _strip_ns(d.tag) == "divisions" and d.text:
                    try:
                        return int(d.text.strip())
                    except Exception:
                        return None
    return None

def _note_has_child(note_el: ET.Element, child_name: str) -> bool:
    return any(_strip_ns(ch.tag) == child_name for ch in list(note_el))

def parse_musicxml_file(path: Path) -> list[ParsedEvent]:
    """Parse a MusicXML (.xml/.musicxml) or compressed (.mxl) into a flat event list.

    Beats convention:
      - 1.0 == quarter note
      - 0.5 == eighth note, etc.

    Assumptions:
      - Monophonic extraction (ignores chord secondary tones)
      - Reads the *first* <part> only (common for single-instrument scores)
    """
    if path.suffix.lower() == ".mxl":
        with zipfile.ZipFile(path, "r") as z:
            xml_names = [n for n in z.namelist() if n.lower().endswith(".xml")]
            if not xml_names:
                raise ValueError("No XML found inside .mxl")
            xml_names.sort(key=lambda n: z.getinfo(n).file_size, reverse=True)
            root = ET.fromstring(z.read(xml_names[0]))
    else:
        root = ET.parse(path).getroot()

    # Find first part (score-partwise)
    parts = [ch for ch in list(root) if _strip_ns(ch.tag) == "part"]
    if not parts:
        # fallback: parse by iterating all notes
        return _parse_notes_stream(root)

    part0 = parts[0]
    return _parse_part(part0, root)

def _parse_part(part_el: ET.Element, root: ET.Element) -> list[ParsedEvent]:
    events: list[ParsedEvent] = []
    divisions = _get_divisions(root) or 1

    tie_active = False
    tie_note: str | None = None
    tie_beats_accum = 0.0

    # iterate measures in order
    for measure in [ch for ch in list(part_el) if _strip_ns(ch.tag) == "measure"]:
        div_here = _get_divisions(measure)
        if div_here:
            divisions = div_here

        for note_el in [ch for ch in list(measure) if _strip_ns(ch.tag) == "note"]:
            # Skip grace notes
            if _note_has_child(note_el, "grace"):
                continue

            is_chord = _note_has_child(note_el, "chord")
            if is_chord:
                # Monophonic extraction: ignore secondary chord notes
                continue

            dur_el = next((ch for ch in list(note_el) if _strip_ns(ch.tag) == "duration"), None)
            if dur_el is None or dur_el.text is None:
                continue
            try:
                dur_divs = int(dur_el.text.strip())
            except Exception:
                continue
            beats = dur_divs / float(divisions)

            is_rest = _note_has_child(note_el, "rest")

            # Tie types can appear as <tie> or <notations><tied>
            tie_types: list[str] = []
            for t in list(note_el):
                if _strip_ns(t.tag) == "tie" and t.get("type"):
                    tie_types.append(t.get("type"))
            for notations in [ch for ch in list(note_el) if _strip_ns(ch.tag) == "notations"]:
                for tied in list(notations):
                    if _strip_ns(tied.tag) == "tied" and tied.get("type"):
                        tie_types.append(tied.get("type"))

            if is_rest:
                if tie_active:
                    events.append(ParsedEvent(type="N", beats=tie_beats_accum, note=tie_note))
                    tie_active = False
                    tie_note = None
                    tie_beats_accum = 0.0
                events.append(ParsedEvent(type="R", beats=beats, note=None))
                continue

            pitch_el = next((ch for ch in list(note_el) if _strip_ns(ch.tag) == "pitch"), None)
            if pitch_el is None:
                continue
            step = None
            alter = None
            octave = None
            for p in list(pitch_el):
                tag = _strip_ns(p.tag)
                if tag == "step":
                    step = (p.text or "").strip()
                elif tag == "alter" and p.text:
                    try:
                        alter = int(p.text.strip())
                    except Exception:
                        alter = None
                elif tag == "octave" and p.text:
                    try:
                        octave = int(p.text.strip())
                    except Exception:
                        octave = None
            if not step or octave is None:
                continue
            note_name = _pitch_to_note(step, alter, octave)

            if "start" in tie_types and "stop" in tie_types:
                events.append(ParsedEvent(type="N", beats=beats, note=note_name))
                continue

            if "start" in tie_types:
                if tie_active:
                    events.append(ParsedEvent(type="N", beats=tie_beats_accum, note=tie_note))
                tie_active = True
                tie_note = note_name
                tie_beats_accum = beats
                continue

            if tie_active:
                tie_beats_accum += beats
                if "stop" in tie_types:
                    events.append(ParsedEvent(type="N", beats=tie_beats_accum, note=tie_note))
                    tie_active = False
                    tie_note = None
                    tie_beats_accum = 0.0
                continue

            events.append(ParsedEvent(type="N", beats=beats, note=note_name))

    if tie_active:
        events.append(ParsedEvent(type="N", beats=tie_beats_accum, note=tie_note))

    return events

def _parse_notes_stream(root: ET.Element) -> list[ParsedEvent]:
    # fallback: older/unusual MusicXML
    divisions = _get_divisions(root) or 1
    events: list[ParsedEvent] = []
    for note_el in root.iter():
        if _strip_ns(note_el.tag) != "note":
            continue
        if _note_has_child(note_el, "grace"):
            continue
        if _note_has_child(note_el, "chord"):
            continue
        dur_el = next((ch for ch in list(note_el) if _strip_ns(ch.tag) == "duration"), None)
        if not dur_el or not dur_el.text:
            continue
        beats = int(dur_el.text.strip()) / float(divisions)
        if _note_has_child(note_el, "rest"):
            events.append(ParsedEvent(type="R", beats=beats, note=None))
            continue
        pitch_el = next((ch for ch in list(note_el) if _strip_ns(ch.tag) == "pitch"), None)
        if not pitch_el:
            continue
        step = None
        alter = None
        octave = None
        for p in list(pitch_el):
            tag = _strip_ns(p.tag)
            if tag == "step":
                step = (p.text or "").strip()
            elif tag == "alter" and p.text:
                alter = int(p.text.strip())
            elif tag == "octave" and p.text:
                octave = int(p.text.strip())
        if not step or octave is None:
            continue
        events.append(ParsedEvent(type="N", beats=beats, note=_pitch_to_note(step, alter, octave)))
    return events
