import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteSave, listSaves, type SaveSummary } from '../api'

export default function SavedListPage() {
  const [items, setItems] = useState<SaveSummary[]>([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setErr(null)
    try {
      const x = await listSaves()
      setItems(x)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return items
    return items.filter((x) => x.title.toLowerCase().includes(qq))
  }, [items, q])

  const doDelete = async (id: string) => {
    if (!confirm('Delete this saved fingering?')) return
    setLoading(true)
    setErr(null)
    try {
      await deleteSave(id)
      await refresh()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Saved fingerings</div>
          <div className="small">Click a title to open a dedicated page you can edit + practice.</div>
        </div>
        <button onClick={refresh} disabled={loading}>
          Refresh
        </button>
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

      {err && (
        <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 10, maxHeight: 520, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th className="small">Reviewed</th>
              <th className="small">Created</th>
              <th>#</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id}>
                <td>
                  <Link to={`/saved/${x.id}`}>{x.title}</Link>
                  {x.score_filename ? <div className="small">{x.score_filename}</div> : null}
                </td>
                <td className="small">
                  {x.last_reviewed ? new Date(x.last_reviewed).toLocaleString() : '—'}
                  <div className="small">{x.review_count}×</div>
                </td>
                <td className="small">{new Date(x.created_at).toLocaleString()}</td>
                <td className="small">{x.num_events}</td>
                <td>
                  <button onClick={() => doDelete(x.id)} disabled={loading}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="small">
                  No saved fingerings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
