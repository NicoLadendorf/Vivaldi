import React, { useEffect, useMemo, useRef, useState } from 'react'
import { OPEN_STRINGS, midiToFreq, midiToNoteName, noteToMidi } from '../utils/music'

type Item = any

const STRINGS = [
  { name: 'G', idx: 0 },
  { name: 'D', idx: 1 },
  { name: 'A', idx: 2 },
  { name: 'E', idx: 3 },
]

function fingerColor(finger: number): string {
  // Requested mapping:
  // 1: red, 2: blue, 3: green, 4: yellow
  switch (finger) {
    case 1:
      return '#ef4444'
    case 2:
      return '#3b82f6'
    case 3:
      return '#22c55e'
    case 4:
      return '#eab308'
    default:
      return '#9ca3af'
  }
}

function isNote(x: Item): boolean {
  return x && x.type === 'N'
}

function approxTextWidthPx(text: string, fontSize: number): number {
  // SVG doesn't support native background for <text>, so we draw a rounded <rect> behind it.
  // This is a simple approximation that's good enough for short labels.
  return Math.max(10, text.length * fontSize * 0.62)
}

function SvgLabel({
  x,
  y,
  text,
  fontSize,
  fontWeight = 600,
  fill = '#111827',
}: {
  x: number
  y: number
  text: string
  fontSize: number
  fontWeight?: number
  fill?: string
}) {
  // SVG doesn't support native background for <text>, so we draw a rounded <rect> behind it.
  // We intentionally DO NOT clamp/shift label positions; instead the chart reserves extra right-space.
  const padLeft = 10
  const padRight = 16
  const padY = 4
  const rx = 9

  const w = approxTextWidthPx(text, fontSize) + padLeft + padRight
  const h = fontSize + padY * 2

  // Anchor the label at x (string position). Background extends more to the right by using asymmetric padding.
  const rectX = x - w / 2
  const rectY = y - fontSize - padY

  return (
    <g>
      <rect
        x={rectX}
        y={rectY}
        width={w}
        height={h}
        rx={rx}
        fill="#ffffff"
        fillOpacity={0.92}
        stroke="#111827"
        strokeOpacity={0.18}
      />
      <text x={x} y={y} textAnchor="middle" fontSize={fontSize} fontWeight={fontWeight} fill={fill}>
        {text}
      </text>
    </g>
  )
}


export default function FingeringViewer({
  fingering,
  bpm = 80,
}: {
  fingering: Item[]
  bpm?: number
}) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playBpm, setPlayBpm] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem('playBpm') || '')
    return Number.isFinite(saved) && saved > 0 ? saved : bpm
  })
  const timerRef = useRef<number | null>(null)

  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null)
  const oscRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null)

  useEffect(() => {
    setI(0)
    setPlaying(false)
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [fingering])

  useEffect(() => {
    window.localStorage.setItem('playBpm', String(playBpm))
  }, [playBpm])

  const current = fingering[i]

  const maxStop = useMemo(() => {
    let m = 28
    for (const it of fingering) {
      if (isNote(it) && typeof it.stop_semitones === 'number') m = Math.max(m, it.stop_semitones)
    }
    return Math.min(Math.max(m + 4, 28), 60)
  }, [fingering])

  const height = 520
  const width = 640
  const top = 40
  const left = 70
  const right = 220
  const bottom = 30

  const plotHeight = height - top - bottom
  const semitoneStep = plotHeight / maxStop

  const xFor = (stringIndex: number) => {
    const innerW = width - left - right
    const step = innerW / (STRINGS.length - 1)
    return left + step * stringIndex
  }

  const yFor = (stop: number) => top + stop * semitoneStep

  const goPrev = () => setI((v) => Math.max(0, v - 1))
  const goNext = () => setI((v) => Math.min(fingering.length - 1, v + 1))

  const togglePlay = () => {
    // Ensure AudioContext is created/resumed in direct response to a user gesture.
    if (!playing) {
      void ensureAudio()
    }
    setPlaying((p) => !p)
  }


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); goNext(); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fingering.length, playing])

  const msFor = (item: Item) => {
    const beats = item?.duration_beats ?? 1
    const beatSeconds = 60 / playBpm
    return Math.max(80, beats * beatSeconds * 1000)
  }

  const stopActiveOsc = () => {
    const a = audioRef.current
    const o = oscRef.current
    if (!a || !o) return
    try {
      const now = a.ctx.currentTime
      o.gain.gain.cancelScheduledValues(now)
      o.gain.gain.setValueAtTime(o.gain.gain.value, now)
      o.gain.gain.linearRampToValueAtTime(0.0, now + 0.015)
      o.osc.stop(now + 0.02)
    } catch {
      // ignore
    }
    try {
      o.osc.disconnect()
      o.gain.disconnect()
    } catch {
      // ignore
    }
    oscRef.current = null
  }

  const ensureAudio = async () => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === 'suspended') await audioRef.current.ctx.resume()
      return audioRef.current
    }
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.value = 0.04
    master.connect(ctx.destination)
    audioRef.current = { ctx, master }
    if (ctx.state === 'suspended') await ctx.resume()
    return audioRef.current
  }

  const playNote = async (item: Item, durationMs: number) => {
    if (!isNote(item)) return
    let midi: number | null = null
    if (typeof item.pitch_midi === 'number') midi = item.pitch_midi
    else if (typeof item.note === 'string' && item.note) {
      try {
        midi = noteToMidi(item.note)
      } catch {
        midi = null
      }
    }
    if (midi == null) return

    const a = await ensureAudio()
    stopActiveOsc()

    const osc = a.ctx.createOscillator()
    const gain = a.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = midiToFreq(midi)
    osc.connect(gain)
    gain.connect(a.master)

    const now = a.ctx.currentTime
    const durSec = Math.max(0.08, durationMs / 1000)
    const attack = 0.01
    const release = 0.03
    const sustainLevel = 0.9

    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(sustainLevel, now + attack)
    gain.gain.setValueAtTime(sustainLevel, now + Math.max(attack, durSec - release))
    gain.gain.linearRampToValueAtTime(0.0, now + durSec)

    osc.start(now)
    osc.stop(now + durSec + 0.01)
    oscRef.current = { osc, gain }
  }

  useEffect(() => {
    if (!playing) return
    if (fingering.length === 0) return

    const item = fingering[i]
    const ms = msFor(item)
    // synth pitch for notes during playback
    playNote(item, ms).catch(() => {})
    timerRef.current = window.setTimeout(() => {
      setI((v) => {
        const next = v + 1
        if (next >= fingering.length) {
          setPlaying(false)
          return v
        }
        return next
      })
    }, ms)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      stopActiveOsc()
    }
  }, [playing, i, fingering, playBpm])

  // stop synth if user pauses
  useEffect(() => {
    if (!playing) stopActiveOsc()
  }, [playing])

  const detailLines = useMemo(() => {
    if (!current) return []
    const lines: string[] = []
    if (current.type === 'R') {
      lines.push(`Rest`)
      lines.push(`Duration (beats): ${current.duration_beats ?? ''}`)
      return lines
    }
    lines.push(`Note: ${current.note}`)
    if (typeof current.pitch_midi === 'number') {
      lines.push(`Pitch: ${midiToNoteName(current.pitch_midi)} (midi ${current.pitch_midi})`)
    } else if (typeof current.note === 'string' && current.note) {
      try {
        const m = noteToMidi(current.note)
        lines.push(`Pitch: ${midiToNoteName(m)} (midi ${m})`)
      } catch {
        // ignore
      }
    }
    lines.push(`Duration (beats): ${current.duration_beats}`)
    lines.push('')
    lines.push(`String: ${current.string} (index ${current.string_index})`)
    lines.push(`Finger: ${current.finger}`)
    if (typeof current.stop_semitones === 'number') {
      const open = OPEN_STRINGS.find((s) => s.idx === Number(current.string_index))
      if (open) {
        lines.push(`Stop: ${current.stop_semitones} semitones above open (${midiToNoteName(open.midi + Number(current.stop_semitones))})`)
      } else {
        lines.push(`Stop: ${current.stop_semitones} semitones above open`)
      }
    }
    if (current.anchor_semitones != null) {
      lines.push('')
      lines.push('Hand position / shape:')
      const open = OPEN_STRINGS.find((s) => s.idx === Number(current.string_index))
      if (open) {
        lines.push(`  Anchor (finger 1): ${current.anchor_semitones} semitones above open (${midiToNoteName(open.midi + Number(current.anchor_semitones))})`)
      } else {
        lines.push(`  Anchor (finger 1): ${current.anchor_semitones} semitones above open`)
      }
      if (current.o2 != null) lines.push(`  Finger2 offset o2: ${current.o2}`)
      if (current.o3 != null) lines.push(`  Finger3 offset o3: ${current.o3}`)
      if (current.o4 != null) lines.push(`  Finger4 offset o4: ${current.o4}`)
      if (current.delta_stop_minus_anchor != null) lines.push(`  Δ = stop - anchor: ${current.delta_stop_minus_anchor}`)
    }
    return lines
  }, [current])

  if (!fingering || fingering.length === 0) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700 }}>Fingering Viewer</div>
        <div className="small" style={{ marginTop: 6 }}>
          No fingering loaded yet.
        </div>
      </div>
    )
  }

  const activeStringIndex = isNote(current) ? Number(current.string_index ?? 0) : -1
  const stop = isNote(current) ? Number(current.stop_semitones ?? 0) : null
  const anchor = isNote(current) ? (current.anchor_semitones != null ? Number(current.anchor_semitones) : null) : null

  const openMidi = isNote(current) ? (OPEN_STRINGS.find((s) => s.idx === activeStringIndex)?.midi ?? null) : null
  const stopNoteName = isNote(current) && openMidi != null && stop != null ? midiToNoteName(openMidi + stop) : null
  const anchorNoteName = isNote(current) && openMidi != null && anchor != null ? midiToNoteName(openMidi + anchor) : null

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Fingering Viewer</div>
          <div className="small">
            Keyboard: <span className="kbd">←</span>/<span className="kbd">→</span> to step, <span className="kbd">Space</span> play/pause
          </div>
        </div>
        <div className="row">
          <button onClick={goPrev} disabled={i === 0}>◀ Prev</button>
          <button
            className="primary"
            onClick={async () => {
              // ensure audio is unlocked on user gesture
              if (!playing) {
                try { await ensureAudio() } catch { /* ignore */ }
              }
              setPlaying((p) => !p)
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={goNext} disabled={i === fingering.length - 1}>Next ▶</button>

          <div style={{ width: 220, marginLeft: 10 }}>
            <div className="small" style={{ marginBottom: 4 }}>Playback BPM: <b>{Math.round(playBpm)}</b></div>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={playBpm}
              onChange={(e) => setPlayBpm(Number(e.target.value))}
              style={{ width: '100%' }}
              aria-label="Playback BPM"
            />
          </div>
        </div>
      </div>

      <div className="viewerGrid">
        <div>
          <svg
            width="100%"
            viewBox={`0 0 ${width} ${height}`}
            style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#ffffff' }}
          >
            {/* string labels */}
            {STRINGS.map((s) => (
              <text
                key={s.idx}
                x={xFor(s.idx)}
                y={24}
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
              >
                {s.name}
              </text>
            ))}

            {/* string lines */}
            {STRINGS.map((s) => (
              <line
                key={s.idx}
                x1={xFor(s.idx)}
                y1={top - 10}
                x2={xFor(s.idx)}
                y2={height - bottom}
                stroke={s.idx === activeStringIndex ? '#6366f1' : '#111827'}
                strokeWidth={s.idx === activeStringIndex ? 6 : 3}
                opacity={s.idx === activeStringIndex ? 0.65 : 0.35}
              />
            ))}

            {/* y ticks */}
            {Array.from({ length: Math.floor(maxStop / 5) + 1 }).map((_, k) => {
              const val = k * 5
              const y = yFor(val)
              return (
                <g key={k}>
                  <line x1={left - 8} y1={y} x2={width - right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                  <text x={left - 14} y={y + 4} textAnchor="end" fontSize="12" fill="#6b7280">
                    {val}
                  </text>
                </g>
              )
            })}

            {/* anchor marker */}
            {isNote(current) && anchor != null && (
              <circle
                cx={xFor(activeStringIndex)}
                cy={yFor(anchor)}
                r={7}
                fill="#9ca3af"
                opacity={0.6}
              />
            )}

            {/* stop marker */}
            {isNote(current) && stop != null && (
              <>
                <circle
                  cx={xFor(activeStringIndex)}
                  cy={yFor(stop)}
                  r={11}
                  fill={fingerColor(Number(current.finger ?? 0))}
                  opacity={0.9}
                />
                <SvgLabel
                  x={xFor(activeStringIndex)}
                  y={yFor(stop) - 16}
                  fontSize={14}
                  fontWeight={700}
                  text={`finger ${current.finger}`}
                />
                <SvgLabel
                  x={xFor(activeStringIndex)}
                  y={yFor(stop) + 28}
                  fontSize={12}
                  fontWeight={600}
                  fill="#374151"
                  text={`stop ${current.stop_semitones}${stopNoteName ? ` (${stopNoteName})` : ''}${anchor != null ? `  anchor ${anchor}${anchorNoteName ? ` (${anchorNoteName})` : ''}  Δ ${current.delta_stop_minus_anchor ?? ''}` : ''}`}
                />
              </>
            )}
          </svg>

          <div className="row" style={{ marginTop: 10 }}>
            <input
              type="range"
              min={0}
              max={Math.max(0, fingering.length - 1)}
              value={i}
              onChange={(ev) => setI(Number(ev.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Item {i + 1} / {fingering.length}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#ffffff' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12 }}>
{detailLines.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  )
}
