import React, { useEffect, useMemo, useState } from 'react'
import { getSave, updateSave, type SaveDetail } from '../api'
import { useParams } from 'react-router-dom'
import FingeringViewer from '../components/FingeringViewer'
import MusicScroll from '../components/MusicScroll'
import FingeringEditor from '../components/FingeringEditor'
import GlobalFingeringSlider from '../components/GlobalFingeringSlider'

type Item = any

export default function FingeringDetailPage({
  onDidUpdate,
}: {
  onDidUpdate?: () => void
}) {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<SaveDetail | null>(null)
  const [fingeringDraft, setFingeringDraft] = useState<Item[]>([])
  const [titleDraft, setTitleDraft] = useState<string>('')
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (!id) return
      setBusy(true)
      setErr(null)
      try {
        const d = await getSave(id)
        setDetail(d)
        setFingeringDraft(Array.isArray(d.fingering) ? d.fingering : [])
        setTitleDraft(d.title ?? '')
        setIndex(0)
        setDirty(false)
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      } finally {
        setBusy(false)
      }
    }
    run()
  }, [id])

  const currentItem = fingeringDraft[index]

  const metaLine = useMemo(() => {
    if (!detail) return ''
    const created = detail.created_at ? new Date(detail.created_at).toLocaleString() : ''
    const reviewed = detail.last_reviewed_at ? new Date(detail.last_reviewed_at).toLocaleString() : 'never'
    const file = detail.score_filename ? ` • ${detail.score_filename}` : ''
    return `Created: ${created}${file} • Last reviewed: ${reviewed}`
  }, [detail])

  const doSave = async () => {
    if (!detail) return
    setBusy(true)
    setErr(null)
    try {
      const updated = await updateSave(detail.id, { title: titleDraft, fingering: fingeringDraft })
      setDetail(updated)
      setFingeringDraft(Array.isArray(updated.fingering) ? updated.fingering : [])
      setTitleDraft(updated.title ?? titleDraft)
      setDirty(false)
      onDidUpdate?.()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const doRevert = () => {
    if (!detail) return
    setFingeringDraft(Array.isArray(detail.fingering) ? detail.fingering : [])
    setTitleDraft(detail.title ?? '')
    setDirty(false)
  }

  const updateItem = (next: Item) => {
    setFingeringDraft((prev) => {
      const out = [...prev]
      out[index] = next
      return out
    })
    setDirty(true)
  }

  if (!id) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700 }}>No fingering selected</div>
        <div className="small" style={{ marginTop: 6 }}>Pick an item from the list.</div>
      </div>
    )
  }

  if (busy && !detail) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700 }}>Loading…</div>
      </div>
    )
  }

  if (err && !detail) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700 }}>Error</div>
        <div className="small" style={{ marginTop: 6, color: '#b91c1c' }}>{err}</div>
      </div>
    )
  }

  if (!detail) return null

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="small">Title</div>
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => {
                setTitleDraft(e.target.value)
                setDirty(true)
              }}
              style={{ width: '100%' }}
            />
            <div className="small" style={{ marginTop: 8 }}>{metaLine}</div>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            {dirty ? <div className="pill">Unsaved changes</div> : <div className="pill">Saved</div>}
            <button onClick={doRevert} disabled={!dirty || busy}>
              Revert
            </button>
            <button className="primary" onClick={doSave} disabled={!dirty || busy}>
              Save changes
            </button>
          </div>
        </div>
        {err ? <div className="small" style={{ marginTop: 10, color: '#b91c1c' }}>{err}</div> : null}
      </div>

      <GlobalFingeringSlider index={index} length={fingeringDraft.length} onChange={setIndex} />

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Music scroll</div>
        <div className="small" style={{ marginBottom: 10 }}>
          Click any cell to jump. The active cell stays centered as you move the slider.
        </div>
        <MusicScroll fingering={fingeringDraft} index={index} onSelect={setIndex} />
      </div>

      <FingeringViewer fingering={fingeringDraft} index={index} onIndexChange={setIndex} showLocalSlider={false} />

      <FingeringEditor item={currentItem} onChange={updateItem} />
    </div>
  )
}
