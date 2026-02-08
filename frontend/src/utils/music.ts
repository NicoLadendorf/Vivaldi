const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export const OPEN_STRINGS = [
  { name: 'G', midi: 55, idx: 0 },
  { name: 'D', midi: 62, idx: 1 },
  { name: 'A', midi: 69, idx: 2 },
  { name: 'E', midi: 76, idx: 3 },
]

export function noteToMidi(note: string): number {
  const s = note.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  const m = s.match(/^([A-Ga-g])([#b]{0,2})(-?\d+)$/)
  if (!m) throw new Error(`Bad note format: ${note}`)
  const letter = m[1].toUpperCase()
  const acc = m[2]
  const octave = parseInt(m[3], 10)
  let sem = NOTE_BASE[letter]
  for (const ch of acc) sem += ch === '#' ? 1 : -1
  sem = ((sem % 12) + 12) % 12
  return 12 * (octave + 1) + sem
}

export function midiToFreq(midi: number): number {
  // A4 (midi 69) = 440 Hz
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiToNoteName(midi: number, preferSharps: boolean = true): string {
  // MIDI 60 => C4
  const sem = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const namesSharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const namesFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  const name = (preferSharps ? namesSharps : namesFlats)[sem] ?? 'C'
  return `${name}${octave}`
}

export function stopSemitonesForString(pitchMidi: number, stringName: string): number {
  const open = OPEN_STRINGS.find((s) => s.name === stringName)
  if (!open) throw new Error(`Unknown string: ${stringName}`)
  return pitchMidi - open.midi
}
