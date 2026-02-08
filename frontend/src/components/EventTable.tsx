import React from 'react'
import type { EventObj } from '../api'

export default function EventTable({
  events,
  onChange,
}: {
  events: EventObj[]
  onChange: (next: EventObj[]) => void
}) {
  const update = (idx: number, patch: Partial<EventObj>) => {
    const next = events.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    onChange(next)
  }

  const addRow = () => onChange([...events, { type: 'N', beats: 1, note: 'C4', slur_to_next: false }])
  const delRow = (idx: number) => onChange(events.filter((_, i) => i !== idx))

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Events</div>
          <div className="small">Format: type {`'N'|'R'`}, beats (quarter=1), note like C4, optional slur→next</div>
        </div>
        <button onClick={addRow}>+ Add</button>
      </div>

      <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 10 }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Beats</th>
              <th>Note</th>
              <th>Slur→Next</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <select
                    value={e.type}
                    onChange={(ev) => update(idx, { type: ev.target.value as any })}
                  >
                    <option value="N">N</option>
                    <option value="R">R</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={String(e.beats)}
                    onChange={(ev) => {
                      const v = Number(ev.target.value)
                      update(idx, { beats: Number.isFinite(v) ? v : e.beats })
                    }}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={e.note ?? ''}
                    disabled={e.type === 'R'}
                    onChange={(ev) => update(idx, { note: ev.target.value })}
                    placeholder={e.type === 'R' ? '(rest)' : 'C4'}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(e.slur_to_next)}
                    disabled={e.type === 'R'}
                    onChange={(ev) => update(idx, { slur_to_next: ev.target.checked })}
                  />
                </td>
                <td>
                  <button onClick={() => delRow(idx)}>Delete</button>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="small">
                  No events yet. Upload & transcribe or add rows manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Tip: you can paste your Python tuple list into the backend or add an import endpoint later.
      </div>
    </div>
  )
}
