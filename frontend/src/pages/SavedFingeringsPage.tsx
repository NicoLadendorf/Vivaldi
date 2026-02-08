import React, { useEffect, useMemo, useState } from 'react'
import { deleteSave, listSaves, type SaveSummary } from '../api'
import { Link, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import FingeringDetailPage from './FingeringDetailPage'

function SavedIndexRedirect({ items }: { items: SaveSummary[] }) {
  const navigate = useNavigate()
  useEffect(() => {
    if (items.length) navigate(`/saved/${items[0].id}`, { replace: true })
  }, [items, navigate])
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Select a saved fingering</div>
      <div className="small" style={{ marginTop: 6 }}>No items yet.</div>
    </div>
  )
}

function SavedLayout({
  items,
  loading,
  err,
  onRefresh,
  onDelete,
}: {
  items: SaveSummary[]
  loading: boolean
  err: string | null
  onRefresh: () => void
  onDelete: (id: string) => void
}) {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return items
    return items.filter((x) => x.title.toLowerCase().includes(qq))
  }, [items, q])

  return (
    <div className="split">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Saved fingerings</div>
            <div className="small">Stored in SQLite in the backend.</div>
          </div>
          <button onClick={onRefresh} disabled={loading}>
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

        {err ? <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div> : null}

        <div style={{ marginTop: 10, maxHeight: 420, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th className="small">Created</th>
                <th className="small">Last reviewed</th>
                <th>#</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr key={x.id} style={{ background: x.id === id ? '#f3f4f6' : undefined }}>
                  <td>
                    <Link to={`/saved/${x.id}`}>{x.title}</Link>
                    {x.score_filename ? <div className="small">{x.score_filename}</div> : null}
                  </td>
                  <td className="small">{new Date(x.created_at).toLocaleString()}</td>
                  <td className="small">{x.last_reviewed_at ? new Date(x.last_reviewed_at).toLocaleString() : 'never'}</td>
                  <td className="small">{x.num_events}</td>
                  <td>
                    <button onClick={() => onDelete(x.id)} disabled={loading}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="small">
                    No saved fingerings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <Outlet />
      </div>
    </div>
  )
}

export default function SavedFingeringsPage() {
  const [items, setItems] = useState<SaveSummary[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doDelete = async (sid: string) => {
    if (!confirm('Delete this saved fingering?')) return
    setLoading(true)
    setErr(null)
    try {
      await deleteSave(sid)
      await refresh()
      // If we deleted the currently-viewed item, go back to /saved.
      if (window.location.pathname.endsWith(`/${sid}`)) {
        navigate('/saved', { replace: true })
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Routes>
      <Route element={<SavedLayout items={items} loading={loading} err={err} onRefresh={refresh} onDelete={doDelete} />}>
        <Route index element={<SavedIndexRedirect items={items} />} />
        <Route path=":id" element={<FingeringDetailPage onDidUpdate={refresh} />} />
      </Route>
    </Routes>
  )
}
