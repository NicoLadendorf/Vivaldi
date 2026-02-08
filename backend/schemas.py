from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Any

EventType = Literal["N", "R"]

@dataclass
class Event:
    type: EventType
    beats: float
    note: str | None = None  # e.g. "C4", only for type == "N"

@dataclass
class FingeringNote:
    type: Literal["N"]
    note: str
    pitch_midi: int
    duration_beats: float
    string: str
    string_index: int
    finger: int  # 0=open, 1..4=finger
    stop_semitones: int

    # Optional fields to match your debug output (fill as you like)
    anchor_semitones: int | None = None
    o2: int | None = None
    o3: int | None = None
    o4: int | None = None
    delta_stop_minus_anchor: int | None = None
    settled_since_last_shift: bool | None = None
    last_o2_used: int | None = None
    last_o3_used: int | None = None
    last_o4_used: int | None = None

@dataclass
class FingeringRest:
    type: Literal["R"]
    duration_beats: float

FingeringItem = FingeringNote | FingeringRest

def coerce_events(payload: Any) -> list[Event]:
    # Accept:
    # - [["N", 1, "C4"], ["R", 0.5, null], ...]
    # - [{"type":"N","beats":1,"note":"C4"}, ...]
    if not isinstance(payload, list):
        raise ValueError("events must be a list")
    out: list[Event] = []
    for i, item in enumerate(payload):
        if isinstance(item, (list, tuple)):
            if len(item) < 2:
                raise ValueError(f"event[{i}] needs at least [type, beats]")
            et = item[0]
            beats = float(item[1])
            note = item[2] if len(item) > 2 else None
            out.append(Event(type=et, beats=beats, note=note))
        elif isinstance(item, dict):
            et = item.get("type")
            beats = float(item.get("beats"))
            note = item.get("note")
            out.append(Event(type=et, beats=beats, note=note))
        else:
            raise ValueError(f"event[{i}] must be list/tuple or object")
    return out
