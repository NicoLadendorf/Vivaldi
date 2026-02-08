import React from 'react'

export default function GlobalFingeringSlider({
  index,
  length,
  onChange,
}: {
  index: number
  length: number
  onChange: (i: number) => void
}) {
  if (length <= 0) return null
  const max = Math.max(0, length - 1)
  const clamped = Math.max(0, Math.min(max, index))

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>Global slider</div>
        <div className="pill">
          Item <b>{clamped + 1}</b> / {length}
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={() => onChange(clamped - 1)} disabled={clamped === 0}>
          ◀ Prev
        </button>
        <input
          type="range"
          min={0}
          max={max}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button onClick={() => onChange(clamped + 1)} disabled={clamped === max}>
          Next ▶
        </button>
      </div>
    </div>
  )
}
