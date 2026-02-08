import React, { useMemo } from 'react'

type Item = any

const STRING_OPTIONS = [
  { name: 'G', index: 0 },
  { name: 'D', index: 1 },
  { name: 'A', index: 2 },
  { name: 'E', index: 3 },
]

function isNote(x: Item): boolean {
  return x && x.type === 'N'
}

function toInt(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

export default function FingeringEditor({
  item,
  onChange,
}: {
  item: Item
  onChange: (next: Item) => void
}) {
  const note = isNote(item)

  const stringOpt = useMemo(() => {
    if (!note) return STRING_OPTIONS[0]
    return STRING_OPTIONS.find((s) => s.name === item.string) ?? STRING_OPTIONS[Math.max(0, Math.min(3, Number(item.string_index ?? 0)))]
  }, [note, item])

  if (!item) return null

  if (!note) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700 }}>Edit item</div>
        <div className="small" style={{ marginTop: 6 }}>
          This item is a rest; there are no fingering fields to edit.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Edit current note</div>
      <div className="small" style={{ marginBottom: 10 }}>
        You can override the computed string/finger/stop. Changes are local until you press <b>Save changes</b>.
      </div>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200 }}>
          <div className="small">String</div>
          <select
            value={stringOpt.name}
            onChange={(e) => {
              const name = e.target.value
              const s = STRING_OPTIONS.find((x) => x.name === name)!
              onChange({ ...item, string: s.name, string_index: s.index })
            }}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          >
            {STRING_OPTIONS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: 140 }}>
          <div className="small">Finger</div>
          <select
            value={String(item.finger ?? 0)}
            onChange={(e) => onChange({ ...item, finger: toInt(e.target.value) ?? 0 })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          >
            {[0, 1, 2, 3, 4].map((f) => (
              <option key={f} value={String(f)}>
                {f === 0 ? '0 (open)' : String(f)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: 160 }}>
          <div className="small">Stop (semitones above open)</div>
          <input
            type="number"
            value={item.stop_semitones ?? ''}
            onChange={(e) => onChange({ ...item, stop_semitones: toInt(e.target.value) ?? 0 })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>
      </div>

      <div style={{ height: 10 }} />

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ minWidth: 160 }}>
          <div className="small">Anchor (finger 1)</div>
          <input
            type="number"
            value={item.anchor_semitones ?? ''}
            onChange={(e) => onChange({ ...item, anchor_semitones: toInt(e.target.value) })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>
        <div style={{ minWidth: 120 }}>
          <div className="small">o2</div>
          <input
            type="number"
            value={item.o2 ?? ''}
            onChange={(e) => onChange({ ...item, o2: toInt(e.target.value) })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>
        <div style={{ minWidth: 120 }}>
          <div className="small">o3</div>
          <input
            type="number"
            value={item.o3 ?? ''}
            onChange={(e) => onChange({ ...item, o3: toInt(e.target.value) })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>
        <div style={{ minWidth: 120 }}>
          <div className="small">o4</div>
          <input
            type="number"
            value={item.o4 ?? ''}
            onChange={(e) => onChange({ ...item, o4: toInt(e.target.value) })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Note: <b>{item.note}</b> • Pitch MIDI: {item.pitch_midi}
      </div>
    </div>
  )
}
