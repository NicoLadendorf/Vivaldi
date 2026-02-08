from __future__ import annotations

"""Your violin fingering dynamic-programming solver.

This file is intentionally standalone (stdlib only) so it can be imported by Flask.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import itertools
import math
import re


# ----------------------------
# Pitch parsing (A4, F#5, Bb3, unicode ♯ ♭ supported)
# ----------------------------

_NOTE_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note_to_midi(note: str) -> int:
    s = note.strip().replace("♯", "#").replace("♭", "b")
    m = re.fullmatch(r"([A-Ga-g])([#b]{0,2})(-?\d+)", s)
    if not m:
        raise ValueError(
            f"Bad note format: {note!r} (expected like 'A4', 'C#5', 'Bb3')"
        )
    letter = m.group(1).upper()
    acc = m.group(2)
    octave = int(m.group(3))
    sem = _NOTE_BASE[letter]
    for ch in acc:
        sem += 1 if ch == "#" else -1
    sem %= 12
    return 12 * (octave + 1) + sem


# ----------------------------
# Violin tuning model
# ----------------------------

_OPEN_STRINGS: List[Tuple[str, int]] = [("G", 55), ("D", 62), ("A", 69), ("E", 76)]
_STRING_NAMES = [s for s, _ in _OPEN_STRINGS]
_OPEN_MIDIS = [m for _, m in _OPEN_STRINGS]


# ----------------------------
# Parameters + Hand shape definition
# ----------------------------


@dataclass(frozen=True)
class HandShape:
    o2: int
    o3: int
    o4: int


@dataclass
class ViolinFingeringParams:
    bpm: float

    max_stop_semitones: int = 29
    max_anchor: int = 29

    finger2_offsets: Tuple[int, ...] = (1, 2)
    finger3_offsets: Tuple[int, ...] = (3, 4)
    finger4_offsets: Tuple[int, ...] = (5, 6)

    # --- Timing / feasibility ---
    shift_speed_semitones_per_sec: float = 0
    adjacent_string_cross_time_sec: float = 0.0
    skip_string_cross_time_sec: float = 0.0
    time_slack_sec: float = 0.0

    open_string_shift_speed_multiplier: float = 1.7
    rest_shift_speed_multiplier: float = 1.4

    # --- Costs ---
    shift_event_cost: float = 0.30
    shift_cost_per_semitone: float = 0.02

    adjacent_string_cross_cost: float = 0.2
    skip_string_cross_cost: float = 1.0

    anchor_linear_cost: float = 0.00
    anchor_quadratic_cost: float = 0.00
    stop_cost_per_semitone: float = 0.01

    finger_change_cost: float = 0.08

    # Same finger consecutive note penalties
    same_finger_repeat_penalty: float = 0.5
    same_finger_repeat_cross_string_same_place_penalty: float = 0.1

    # Shape change penalty when anchor stays same
    shape_change_cost_per_semitone: float = 0.2

    # retarget penalty uses "last time this finger was used since last anchor shift"
    used_finger_retarget_cost_per_semitone: float = 0.12

    finger_base_cost: Dict[int, float] = field(
        default_factory=lambda: {
            0: 0.00,
            1: 0.00,
            2: 0.03,
            3: 0.06,
            4: 0.10,
        }
    )

    preferred_finger_by_delta: Dict[int, int] = field(
        default_factory=lambda: {
            0: 1,
            1: 2,
            2: 2,
            3: 3,
            4: 3,
            5: 4,
            6: 4,
            7: 4,
        }
    )
    preferred_finger_bonus: float = -0.20
    nonpreferred_finger_penalty: float = 1.00

    open_string_note_cost: float = 0.1

    # "settle into anchor before shifting"
    unsettled_shift_penalty: float = 0.35
    settled_shift_bonus: float = 0.0

    # long rest discount on shifting
    long_rest_threshold_sec: float = 2.0
    long_rest_shift_multiplier: float = 0.10
    min_shift_event_cost_after_long_rest: float = 0.02


@dataclass(frozen=True)
class State:
    string_idx: int
    anchor: int
    shape: HandShape
    finger: int  # 0=open, 1..4
    stop: int
    pitch_midi: int

    @property
    def string_name(self) -> str:
        return _STRING_NAMES[self.string_idx]


@dataclass(frozen=True)
class DPKey:
    state: State
    settled: bool
    last_o2: int
    last_o3: int
    last_o4: int


class ViolinFingeringSolver:
    def __init__(self, params: ViolinFingeringParams):
        self.p = params
        self.sec_per_beat = 60.0 / params.bpm
        self.shapes: List[HandShape] = [
            HandShape(o2, o3, o4)
            for (o2, o3, o4) in itertools.product(
                self.p.finger2_offsets,
                self.p.finger3_offsets,
                self.p.finger4_offsets,
            )
        ]

    def _parse_events(self, events: List[Tuple]) -> List[Dict[str, Any]]:
        notes: List[Dict[str, Any]] = []
        i = 0
        while i < len(events):
            typ = str(events[i][0]).upper()
            if typ == "N":
                dur = float(events[i][1])
                name = str(events[i][2])
                midi = note_to_midi(name)

                gap = dur
                rest_after = 0.0
                j = i + 1
                while j < len(events) and str(events[j][0]).upper() == "R":
                    rdur = float(events[j][1])
                    gap += rdur
                    rest_after += rdur
                    j += 1

                notes.append(
                    {
                        "event_index": i,
                        "note_name": name,
                        "pitch_midi": midi,
                        "duration_beats": dur,
                        "rest_after_beats": rest_after,
                        "gap_beats": gap,
                    }
                )
                i = j
            elif typ == "R":
                i += 1
            else:
                raise ValueError(f"Unknown event type {events[i][0]!r} at index {i}")
        return notes

    def _states_for_pitch(self, pitch_midi: int) -> List[State]:
        states: List[State] = []
        seen = set()

        for s_idx, open_midi in enumerate(_OPEN_MIDIS):
            stop = pitch_midi - open_midi
            if stop < 0 or stop > self.p.max_stop_semitones:
                continue

            # Open string: any anchor/shape with finger 0
            if stop == 0:
                for shape in self.shapes:
                    for anchor in range(0, self.p.max_anchor + 1):
                        key = (s_idx, anchor, shape, 0)
                        if key in seen:
                            continue
                        states.append(State(s_idx, anchor, shape, 0, stop, pitch_midi))
                        seen.add(key)
                continue

            for shape in self.shapes:
                # finger1: stop == anchor
                anchor = stop
                if 1 <= anchor <= self.p.max_anchor:
                    key = (s_idx, anchor, shape, 1)
                    if key not in seen:
                        states.append(State(s_idx, anchor, shape, 1, stop, pitch_midi))
                        seen.add(key)

                # finger2
                anchor = stop - shape.o2
                if 1 <= anchor <= self.p.max_anchor:
                    key = (s_idx, anchor, shape, 2)
                    if key not in seen:
                        states.append(State(s_idx, anchor, shape, 2, stop, pitch_midi))
                        seen.add(key)

                # finger3
                anchor = stop - shape.o3
                if 1 <= anchor <= self.p.max_anchor:
                    key = (s_idx, anchor, shape, 3)
                    if key not in seen:
                        states.append(State(s_idx, anchor, shape, 3, stop, pitch_midi))
                        seen.add(key)

                # finger4
                anchor = stop - shape.o4
                if 1 <= anchor <= self.p.max_anchor:
                    key = (s_idx, anchor, shape, 4)
                    if key not in seen:
                        states.append(State(s_idx, anchor, shape, 4, stop, pitch_midi))
                        seen.add(key)

        return states

    # ---------- Costs ----------

    def _finger_preference_cost(self, finger: int, delta: int) -> float:
        if finger == 0:
            return 0.0
        pref = self.p.preferred_finger_by_delta.get(delta)
        if pref is None:
            return 0.0
        return (
            self.p.preferred_finger_bonus
            if finger == pref
            else self.p.nonpreferred_finger_penalty
        )

    def _note_cost(self, st: State) -> float:
        if st.finger == 0 and st.stop == 0:
            return float(self.p.open_string_note_cost)

        a = st.anchor
        cost = 0.0
        cost += a * self.p.anchor_linear_cost
        cost += (a * a) * self.p.anchor_quadratic_cost
        cost += st.stop * self.p.stop_cost_per_semitone
        cost += self.p.finger_base_cost.get(st.finger, 0.0)

        delta = st.stop - st.anchor
        cost += self._finger_preference_cost(st.finger, delta)
        return cost

    def _is_anchor_note(self, st: State) -> bool:
        return (st.finger == 1) and ((st.stop - st.anchor) == 0)

    def _offset_for_finger(self, shape: HandShape, finger: int) -> int:
        if finger in (0, 1):
            return 0
        if finger == 2:
            return shape.o2
        if finger == 3:
            return shape.o3
        if finger == 4:
            return shape.o4
        return 0

    def _transition_cost_and_feasible(
        self,
        prev_key: DPKey,
        cur_state: State,
        next_settled: bool,
        next_last_o2: int,
        next_last_o3: int,
        next_last_o4: int,
        avail_sec: float,
        rest_after_prev_beats: float,
    ) -> float:
        prev = prev_key.state
        cur = cur_state

        anchor_shift = abs(cur.anchor - prev.anchor)
        string_cross = abs(cur.string_idx - prev.string_idx)

        # timing
        speed = self.p.shift_speed_semitones_per_sec
        if prev.finger == 0 and prev.stop == 0:
            speed *= self.p.open_string_shift_speed_multiplier
        if rest_after_prev_beats > 0:
            speed *= self.p.rest_shift_speed_multiplier

        if string_cross <= 1:
            cross_time = string_cross * self.p.adjacent_string_cross_time_sec
        else:
            cross_time = self.p.adjacent_string_cross_time_sec + (
                string_cross - 1
            ) * self.p.skip_string_cross_time_sec

        required_sec = (anchor_shift / max(speed, 1e-6)) + cross_time

        # long rest discount on shifting
        rest_sec = rest_after_prev_beats * self.sec_per_beat
        shift_mult = 1.0
        if rest_sec >= self.p.long_rest_threshold_sec:
            shift_mult = self.p.long_rest_shift_multiplier

        cost = 0.0

        # string crossing cost
        if string_cross <= 1:
            cost += self.p.adjacent_string_cross_cost
        else:
            cost += (string_cross - 1) * self.p.skip_string_cross_cost

        # shape change penalty if anchor unchanged
        if cur.anchor == prev.anchor and cur.shape != prev.shape:
            dist = (
                abs(cur.shape.o2 - prev.shape.o2)
                + abs(cur.shape.o3 - prev.shape.o3)
                + abs(cur.shape.o4 - prev.shape.o4)
            )
            cost += dist * self.p.shape_change_cost_per_semitone

        # retarget penalty based on last time THIS finger was used
        if cur.anchor == prev.anchor and cur.finger in (2, 3, 4):
            cur_off = self._offset_for_finger(cur.shape, cur.finger)
            if cur.finger == 2 and prev_key.last_o2 != -1 and prev_key.last_o2 != cur_off:
                cost += (
                    abs(prev_key.last_o2 - cur_off)
                    * self.p.used_finger_retarget_cost_per_semitone
                )
            if cur.finger == 3 and prev_key.last_o3 != -1 and prev_key.last_o3 != cur_off:
                cost += (
                    abs(prev_key.last_o3 - cur_off)
                    * self.p.used_finger_retarget_cost_per_semitone
                )
            if cur.finger == 4 and prev_key.last_o4 != -1 and prev_key.last_o4 != cur_off:
                cost += (
                    abs(prev_key.last_o4 - cur_off)
                    * self.p.used_finger_retarget_cost_per_semitone
                )

        # consecutive same-finger penalty
        # Apply ONLY if the same finger is used for a *different pitch*.
        if prev.finger != 0 and prev.finger == cur.finger and prev.pitch_midi != cur.pitch_midi:
            same_place_only_string = (
                prev.string_idx != cur.string_idx
                and prev.anchor == cur.anchor
                and prev.shape == cur.shape
                and prev.stop == cur.stop
            )
            if same_place_only_string:
                cost += self.p.same_finger_repeat_cross_string_same_place_penalty
            else:
                cost += self.p.same_finger_repeat_penalty
        else:
            if prev.finger != cur.finger and prev.finger != 0 and cur.finger != 0:
                cost += self.p.finger_change_cost

        # anchor shift cost
        if anchor_shift > 0:
            if not prev_key.settled:
                cost += self.p.unsettled_shift_penalty
            else:
                cost += self.p.settled_shift_bonus

            event_cost = self.p.shift_event_cost * shift_mult
            if shift_mult < 1.0:
                event_cost = max(event_cost, self.p.min_shift_event_cost_after_long_rest)
            cost += event_cost
            cost += (anchor_shift * self.p.shift_cost_per_semitone) * shift_mult

        # NOTE: required_sec / avail_sec feasibility check is currently not enforced here.
        # If you want it, you'd typically return math.inf when required_sec > avail_sec + slack.

        return cost

    def solve(self, events: List[Tuple]) -> Dict[str, Any]:
        notes = self._parse_events(events)
        if not notes:
            return {"total_cost": 0.0, "note_fingerings": [], "events_out": []}

        states_per_note: List[List[State]] = [
            self._states_for_pitch(n["pitch_midi"]) for n in notes
        ]
        for i, sts in enumerate(states_per_note):
            if not sts:
                raise ValueError(
                    f"No playable states for note {notes[i]['note_name']} (midi={notes[i]['pitch_midi']}). "
                    "Try increasing max_stop_semitones/max_anchor or adding more shapes."
                )

        dp_prev: Dict[DPKey, float] = {}
        backptr: List[Dict[DPKey, Optional[DPKey]]] = []

        # init
        first_back: Dict[DPKey, Optional[DPKey]] = {}
        for st in states_per_note[0]:
            settled0 = self._is_anchor_note(st)
            last_o2 = st.shape.o2 if st.finger == 2 else -1
            last_o3 = st.shape.o3 if st.finger == 3 else -1
            last_o4 = st.shape.o4 if st.finger == 4 else -1
            key = DPKey(st, settled0, last_o2, last_o3, last_o4)
            dp_prev[key] = self._note_cost(st)
            first_back[key] = None
        backptr.append(first_back)

        # iterate
        for i in range(1, len(notes)):
            avail_sec = 100  # notes[i - 1]["gap_beats"] * self.sec_per_beat
            rest_after_prev = notes[i - 1]["rest_after_beats"]

            dp_cur: Dict[DPKey, float] = {}
            back_cur: Dict[DPKey, Optional[DPKey]] = {}

            for prev_key, prev_cost in dp_prev.items():
                prev_st = prev_key.state

                for cur_st in states_per_note[i]:
                    anchor_changed = cur_st.anchor != prev_st.anchor

                    # settled update
                    if anchor_changed:
                        next_settled = self._is_anchor_note(cur_st)
                    else:
                        next_settled = prev_key.settled or self._is_anchor_note(cur_st)

                    # last-used offsets update
                    if anchor_changed:
                        next_last_o2 = -1
                        next_last_o3 = -1
                        next_last_o4 = -1
                    else:
                        next_last_o2 = prev_key.last_o2
                        next_last_o3 = prev_key.last_o3
                        next_last_o4 = prev_key.last_o4

                    if cur_st.finger == 2:
                        next_last_o2 = cur_st.shape.o2
                    elif cur_st.finger == 3:
                        next_last_o3 = cur_st.shape.o3
                    elif cur_st.finger == 4:
                        next_last_o4 = cur_st.shape.o4

                    tcost = self._transition_cost_and_feasible(
                        prev_key,
                        cur_st,
                        next_settled,
                        next_last_o2,
                        next_last_o3,
                        next_last_o4,
                        avail_sec,
                        rest_after_prev,
                    )
                    if tcost == math.inf:
                        continue

                    total = prev_cost + tcost + self._note_cost(cur_st)
                    cur_key = DPKey(
                        cur_st, next_settled, next_last_o2, next_last_o3, next_last_o4
                    )

                    if total < dp_cur.get(cur_key, math.inf):
                        dp_cur[cur_key] = total
                        back_cur[cur_key] = prev_key

            dp_prev = dp_cur
            backptr.append(back_cur)

        if not dp_prev:
            raise ValueError(
                "No feasible fingering path found under the current timing/movement constraints."
            )

        end_key = min(dp_prev.keys(), key=lambda k: dp_prev[k])
        total_cost = dp_prev[end_key]

        # reconstruct
        path_keys: List[DPKey] = []
        cur = end_key
        for i in range(len(notes) - 1, -1, -1):
            path_keys.append(cur)
            prev = backptr[i].get(cur)
            if prev is None:
                break
            cur = prev
        path_keys.reverse()

        # output
        note_fingerings: List[Dict[str, Any]] = []
        for n, key in zip(notes, path_keys):
            st = key.state
            note_fingerings.append(
                {
                    "note": n["note_name"],
                    "pitch_midi": n["pitch_midi"],
                    "duration_beats": n["duration_beats"],
                    "string": st.string_name,
                    "string_index": st.string_idx,
                    "finger": st.finger,
                    "anchor_semitones": st.anchor,
                    "o2": st.shape.o2,
                    "o3": st.shape.o3,
                    "o4": st.shape.o4,
                    "stop_semitones": st.stop,
                    "delta_stop_minus_anchor": st.stop - st.anchor,
                    "settled_since_last_shift": key.settled,
                    "last_o2_used": key.last_o2,
                    "last_o3_used": key.last_o3,
                    "last_o4_used": key.last_o4,
                }
            )

        # map back to original events
        note_idx_by_event_index = {n["event_index"]: i for i, n in enumerate(notes)}
        events_out: List[Dict[str, Any]] = []
        for ev_i, ev in enumerate(events):
            typ = str(ev[0]).upper()
            if typ == "R":
                events_out.append({"type": "R", "beats": float(ev[1])})
            elif typ == "N":
                idx = note_idx_by_event_index.get(ev_i)
                fing = note_fingerings[idx] if idx is not None else None
                events_out.append(
                    {
                        "type": "N",
                        "beats": float(ev[1]),
                        "note": str(ev[2]),
                        "fingering": fing,
                    }
                )
            else:
                raise ValueError(f"Unknown event type {ev[0]!r} at index {ev_i}")

        return {"total_cost": total_cost, "note_fingerings": note_fingerings, "events_out": events_out}
