from __future__ import annotations

NOTE_BASE = {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}

def note_to_midi(note: str) -> int:
    # e.g. C4, C#4, Db4
    note = note.strip()
    if len(note) < 2:
        raise ValueError(f"Bad note: {note}")
    step = note[0].upper()
    i = 1
    acc = 0
    while i < len(note) and note[i] in "#b":
        acc += 1 if note[i] == "#" else -1
        i += 1
    octave = int(note[i:])
    return 12 * (octave + 1) + NOTE_BASE[step] + acc

def clamp(x: int, lo: int, hi: int) -> int:
    return lo if x < lo else hi if x > hi else x
