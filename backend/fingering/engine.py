from __future__ import annotations

from dataclasses import asdict
from typing import Any

from schemas import Event, FingeringNote, FingeringRest
from fingering.violin_solver import ViolinFingeringParams, ViolinFingeringSolver


def compute_fingering(events: list[Event], bpm: float = 80.0) -> tuple[list[dict[str, Any]], float]:
    """Compute violin fingering using the user's DP solver.

    Input:
      events: list[Event] where Event.type is "N" or "R" and Event.note like "C4".

    Output:
      (flattened_fingering_items, total_cost)

    "flattened_fingering_items" is a list where each item is either:
      - FingeringRest  {type:"R", duration_beats:...}
      - FingeringNote  {type:"N", note:"C4", duration_beats:..., string:"G", ...}

    This flattened format is what the React FingeringViewer expects.
    """

    # Convert to the tuple format your solver consumes.
    tuple_events: list[tuple] = []
    for ev in events:
        if str(ev.type).upper() == "R":
            tuple_events.append(("R", float(ev.beats)))
        elif str(ev.type).upper() == "N":
            if not ev.note:
                raise ValueError("Note event missing 'note' field")
            tuple_events.append(("N", float(ev.beats), str(ev.note)))
        else:
            raise ValueError(f"Unknown event type {ev.type!r}")

    params = ViolinFingeringParams(bpm=float(bpm))
    solver = ViolinFingeringSolver(params)
    res = solver.solve(tuple_events)

    total_cost = float(res.get("total_cost", 0.0))
    events_out = res.get("events_out") or []

    flattened: list[dict[str, Any]] = []
    for ev in events_out:
        typ = str(ev.get("type", "")).upper()
        if typ == "R":
            flattened.append(asdict(FingeringRest(type="R", duration_beats=float(ev.get("beats", 0.0)))))
            continue

        if typ != "N":
            raise ValueError(f"Unexpected events_out item type: {typ!r}")

        fing = ev.get("fingering") or {}
        # duration: prefer solver's duration_beats (note-only); fallback to event beats
        duration_beats = fing.get("duration_beats", ev.get("beats"))

        note_obj = FingeringNote(
            type="N",
            note=str(fing.get("note") or ev.get("note") or ""),
            pitch_midi=int(fing.get("pitch_midi")),
            duration_beats=float(duration_beats),
            string=str(fing.get("string")),
            string_index=int(fing.get("string_index")),
            finger=int(fing.get("finger")),
            stop_semitones=int(fing.get("stop_semitones")),
            anchor_semitones=fing.get("anchor_semitones"),
            o2=fing.get("o2"),
            o3=fing.get("o3"),
            o4=fing.get("o4"),
            delta_stop_minus_anchor=fing.get("delta_stop_minus_anchor"),
            settled_since_last_shift=fing.get("settled_since_last_shift"),
            last_o2_used=fing.get("last_o2_used"),
            last_o3_used=fing.get("last_o3_used"),
            last_o4_used=fing.get("last_o4_used"),
        )
        flattened.append(asdict(note_obj))

    return flattened, total_cost
