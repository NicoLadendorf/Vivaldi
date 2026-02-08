import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSave, listSaves, markReviewed, type SaveDetail, type SaveSummary } from '../api'
import FingeringViewer from '../components/FingeringViewer'

const CARD_SECONDS = 90

function sortByReview(saves: SaveSummary[]): SaveSummary[] {
  const toT = (s?: string | null) => (s ? new Date(s).getTime() : -1)
  return [...saves].sort((a, b) => {
    const ta = toT(a.last_reviewed)
    const tb = toT(b.last_reviewed)
    if (ta !== tb) return ta - tb
    // tie-breaker: older created first
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export default function PracticePage() {
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [queue, setQueue] = useState<SaveSummary[]>([])
  const [idx, setIdx] = useState(0)
  const [detail, setDetail] = useState<SaveDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [secondsLeft, setSecondsLeft] = useState<number>(CARD_SECONDS)
  const tickRef = useRef<number | null>(null)

  const current = queue[idx]

  const refresh = async () => {
    setBusy(true)
    setErr(null)
    try {
      const list = await listSaves()
      setSaves(list)
      const q = sortByReview(list)
      setQueue(q)
      setIdx(0)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [])

  const loadCurrent = async () => {
    if (!current) {
      setDetail(null)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const d = await getSave(current.id)
      setDetail(d)
      setSecondsLeft(CARD_SECONDS)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadCurrent()
  }, [current?.id])

  // Start / restart timer whenever a new card loads
  useEffect(() => {
    if (!detail) return
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [detail?.id])

  const canAdvance = secondsLeft <= 0

  const advance = async () => {
    if (!current) return
    setBusy(true)
    setErr(null)
    try {
      await markReviewed(current.id)
      const nextIdx = idx + 1
      if (nextIdx >= queue.length) {
        // refresh the queue so ordering reflects new last_reviewed values
        await refresh()
      } else {
        setIdx(nextIdx)
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const remainingLabel = useMemo(() => {
    const m = Math.floor(secondsLeft / 60)
    const s = secondsLeft % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }, [secondsLeft])

  if (!queue.length) {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Practice</div>
            <div className="small">No saved fingerings yet.</div>
          </div>
          <Link to="/">Create one</Link>
        </div>
        {err ? <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div> : null}
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Practice queue</div>
            <div className="small">
              Ordered by least-recently reviewed (never-reviewed first). Timer: 1:30 per card.
            </div>
          </div>

          <div className="row">
            <button onClick={refresh} disabled={busy}>Reload queue</button>
            {current ? <Link to={`/saved/${current.id}`}>Open card</Link> : null}
          </div>
        </div>

        {err && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}

        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{current?.title}</div>
            <div className="small">
              Card {idx + 1} / {queue.length}
              {current?.last_reviewed ? ` • last: ${new Date(current.last_reviewed).toLocaleString()}` : ' • never reviewed'}
            </div>
          </div>

          <div className="row">
            <div className="timerPill">
              {remainingLabel}
            </div>
            <button className="primary" onClick={advance} disabled={!canAdvance || busy}>
              Next card
            </button>
          </div>
        </div>

        {!canAdvance ? (
          <div className="small" style={{ marginTop: 8 }}>
            “Next card” unlocks when the timer hits 0:00.
          </div>
        ) : (
          <div className="small" style={{ marginTop: 8 }}>
            Timer complete — advance when ready.
          </div>
        )}
      </div>

      {detail ? <FingeringViewer fingering={detail.fingering} /> : null}
    </div>
  )
}
