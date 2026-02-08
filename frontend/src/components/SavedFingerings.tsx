import React, { useEffect, useMemo, useState } from 'react'
import { deleteSave, getSave, listSaves, type SaveDetail, type SaveSummary } from '../api'
import FingeringViewer from './FingeringViewer'

export default function SavedFingerings() {
  const [items, setItems] = useState<SaveSummary[]>([])
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SaveDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setErr(null)
    try {
      const x = await listSaves()
      setItems(x)
      if (x.length && !selectedId) setSelectedId(x[0].id)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const run = async () => {
      if (!selectedId) return
      setLoading(true)
      setErr(null)
      try {
        const d = await getSave(selectedId)
        setDetail(d)
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [selectedId])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return items
    return items.filter((x) => x.title.toLowerCase().includes(qq))
  }, [items, q])

  const doDelete = async (id: string) => {
    if (!confirm('Delete this saved fingering?')) return
    setLoading(true)
    try {
      await deleteSave(id)
      await refresh()
      setDetail(null)
      setSelectedId(null)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="split">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Saved fingerings</div>
            <div className="small">Stored in SQLite in the backend.</div>
          </div>
          <button onClick={refresh} disabled={loading}>Refresh</button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            type="text"
            placeholder="Search by title..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {err && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}

        <div style={{ marginTop: 10, maxHeight: 420, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th className="small">Created</th>
                <th>#</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr key={x.id} style={{ background: x.id === selectedId ? '#f3f4f6' : undefined }}>
                  <td>
                    <a href="#" onClick={(e) => { e.preventDefault(); setSelectedId(x.id) }}>
                      {x.title}
                    </a>
                    {x.score_filename ? <div className="small">{x.score_filename}</div> : null}
                  </td>
                  <td className="small">{new Date(x.created_at).toLocaleString()}</td>
                  <td className="small">{x.num_events}</td>
                  <td>
                    <button onClick={() => doDelete(x.id)} disabled={loading}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="small">No saved fingerings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        {detail ? (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{detail.title}</div>
              <div className="small">
                {new Date(detail.created_at).toLocaleString()} {detail.score_filename ? `• ${detail.score_filename}` : ''}
              </div>
            </div>
            <FingeringViewer fingering={detail.fingering} />
          </>
        ) : (
          <div className="card">
            <div style={{ fontWeight: 700 }}>Select a saved fingering</div>
            <div className="small" style={{ marginTop: 6 }}>Nothing selected.</div>
          </div>
        )}
      </div>
    </div>
  )
}
