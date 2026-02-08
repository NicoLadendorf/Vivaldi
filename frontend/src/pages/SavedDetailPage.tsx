import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteSave, getSave, markReviewed, updateSave, type SaveDetail } from '../api'
import FingeringViewer from '../components/FingeringViewer'
import { noteToMidi, OPEN_STRINGS, stopSemitonesForString } from '../utils/music'

type FingeringItem = any

const STRING_OPTIONS = OPEN_STRINGS.map((s) => s.name)
const FINGER_OPTIONS = [0, 1, 2, 3, 4]

function isNote(item: FingeringItem) {
  return item && item.type === 'N'
}

export default function SavedDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()

  const [detail, setDetail] = useState<SaveDetail | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftFingering, setDraftFingering] = useState<FingeringItem[] | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!id) return
    setBusy(true)
    setErr(null)
    try {
      const d = await getSave(id)
      setDetail(d)
      setDraftTitle(d.title)
      setDraftFingering(d.fingering)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const dirty = useMemo(() => {
    if (!detail || !draftFingering) return false
    return draftTitle !== detail.title || JSON.stringify(draftFingering) !== JSON.stringify(detail.fingering)
  }, [detail, draftTitle, draftFingering])

  const updateItem = (idx: number, updater: (prev: FingeringItem) => FingeringItem) => {
    setDraftFingering((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[idx] = updater(next[idx])
      return next
    })
  }

  const setString = (idx: number, newString: string) => {
    updateItem(idx, (prev) => {
      if (!isNote(prev)) return prev
      const pitch = typeof prev.pitch_midi === 'number' ? prev.pitch_midi : noteToMidi(String(prev.note))
      const stop = stopSemitonesForString(pitch, newString)
      const stringIndex = OPEN_STRINGS.find((s) => s.name === newString)?.idx ?? 0

      const next: any = { ...prev }
      next.pitch_midi = pitch
      next.string = newString
      next.string_index = stringIndex
      next.stop_semitones = stop

      // Keep some derived fields coherent for common cases.
      if (next.finger === 1) {
        next.anchor_semitones = stop
        next.delta_stop_minus_anchor = 0
      } else if (next.finger === 2 && typeof next.o2 === 'number') {
        next.anchor_semitones = stop - next.o2
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      } else if (next.finger === 3 && typeof next.o3 === 'number') {
        next.anchor_semitones = stop - next.o3
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      } else if (next.finger === 4 && typeof next.o4 === 'number') {
        next.anchor_semitones = stop - next.o4
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      }
      return next
    })
  }

  const setFinger = (idx: number, newFinger: number) => {
    updateItem(idx, (prev) => {
      if (!isNote(prev)) return prev
      const next: any = { ...prev }
      next.finger = newFinger

      const pitch = typeof next.pitch_midi === 'number' ? next.pitch_midi : noteToMidi(String(next.note))
      next.pitch_midi = pitch
      const string = String(next.string ?? 'G')
      const stop = typeof next.stop_semitones === 'number' ? next.stop_semitones : stopSemitonesForString(pitch, string)
      next.stop_semitones = stop

      // Adjust anchor/delta for common cases.
      if (newFinger === 0) {
        // Only valid if the note is literally open on that string.
        // We leave the fields but the UI disables illegal cases.
        next.anchor_semitones = next.anchor_semitones ?? null
      } else if (newFinger === 1) {
        next.anchor_semitones = stop
        next.delta_stop_minus_anchor = 0
      } else if (newFinger === 2 && typeof next.o2 === 'number') {
        next.anchor_semitones = stop - next.o2
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      } else if (newFinger === 3 && typeof next.o3 === 'number') {
        next.anchor_semitones = stop - next.o3
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      } else if (newFinger === 4 && typeof next.o4 === 'number') {
        next.anchor_semitones = stop - next.o4
        next.delta_stop_minus_anchor = stop - next.anchor_semitones
      }
      return next
    })
  }

  const canUseOpen = (item: any) => {
    if (!isNote(item)) return false
    try {
      const pitch = typeof item.pitch_midi === 'number' ? item.pitch_midi : noteToMidi(String(item.note))
      const open = OPEN_STRINGS.find((s) => s.name === String(item.string))
      return !!open && pitch === open.midi
    } catch {
      return false
    }
  }

  const doSave = async () => {
    if (!id || !detail || !draftFingering) return
    setBusy(true)
    setErr(null)
    try {
      await updateSave(id, {
        title: draftTitle,
        fingering: draftFingering,
        // Keep original events unless you decide to edit them too.
        events: detail.events,
        score_filename: detail.score_filename ?? null,
      })
      await load()
      setEditMode(false)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!id) return
    if (!confirm('Delete this saved fingering?')) return
    setBusy(true)
    setErr(null)
    try {
      await deleteSave(id)
      nav('/saved')
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const doMarkReviewed = async () => {
    if (!id) return
    setBusy(true)
    setErr(null)
    try {
      await markReviewed(id)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!detail) {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>Saved fingering</div>
          <Link to="/saved">Back</Link>
        </div>
        {err ? <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div> : <div className="small" style={{ marginTop: 8 }}>Loading…</div>}
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            {editMode ? (
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                style={{ width: 420, maxWidth: '100%' }}
              />
            ) : (
              <div style={{ fontWeight: 800, fontSize: 18 }}>{detail.title}</div>
            )}
            <div className="small" style={{ marginTop: 4 }}>
              Created: {new Date(detail.created_at).toLocaleString()}
              {detail.updated_at ? ` • Updated: ${new Date(detail.updated_at).toLocaleString()}` : ''}
              {detail.score_filename ? ` • ${detail.score_filename}` : ''}
            </div>
            <div className="small" style={{ marginTop: 2 }}>
              Reviewed: {detail.last_reviewed ? new Date(detail.last_reviewed).toLocaleString() : '—'} • {detail.review_count}×
            </div>
          </div>

          <div className="row">
            <Link className="btnLink" to="/saved">
              Back
            </Link>
            <button onClick={doMarkReviewed} disabled={busy}>
              Mark reviewed
            </button>
            <button onClick={() => {
              setEditMode((v) => !v)
              // Reset draft if canceling
              if (editMode) {
                setDraftTitle(detail.title)
                setDraftFingering(detail.fingering)
              }
            }} disabled={busy}>
              {editMode ? 'Cancel edit' : 'Edit fingering'}
            </button>
            <button onClick={doDelete} disabled={busy}>
              Delete
            </button>
          </div>
        </div>

        {err && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}

        {editMode && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={doSave} disabled={busy || !dirty}>
              Save changes
            </button>
            {!dirty ? <div className="small">No edits yet.</div> : <div className="small">Edits pending.</div>}
          </div>
        )}
      </div>

      {editMode && draftFingering ? (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Edit fingering</div>
          <div className="small" style={{ marginBottom: 10 }}>
            You can change string + finger per note. Colors in the viewer update live.
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th>Beats</th>
                  <th>Slur→next</th>
                  <th>String</th>
                  <th>Finger</th>
                  <th className="small">Stop</th>
                </tr>
              </thead>
              <tbody>
                {draftFingering.map((it, idx) => (
                  <tr key={idx}>
                    <td className="small">{idx + 1}</td>
                    <td className="small">{it.type}</td>
                    <td>{isNote(it) ? it.note : ''}</td>
                    <td className="small">{it.duration_beats ?? ''}</td>
                    <td className="small">{isNote(it) ? (it.slur_to_next ? 'yes' : 'no') : ''}</td>
                    <td>
                      {isNote(it) ? (
                        <select value={String(it.string ?? 'G')} onChange={(e) => setString(idx, e.target.value)}>
                          {STRING_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                    <td>
                      {isNote(it) ? (
                        <select
                          value={Number(it.finger ?? 1)}
                          onChange={(e) => setFinger(idx, Number(e.target.value))}
                        >
                          {FINGER_OPTIONS.map((f) => (
                            <option key={f} value={f} disabled={f === 0 && !canUseOpen(it)}>
                              {f}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                    <td className="small">{isNote(it) ? it.stop_semitones : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <FingeringViewer fingering={(editMode ? draftFingering : detail.fingering) ?? []} />
    </div>
  )
}
