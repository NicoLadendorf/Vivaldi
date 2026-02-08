import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSave, finger, transcribe, type EventObj } from '../api'
import EventTable from './EventTable'
import FingeringViewer from './FingeringViewer'

export default function TranscribeAndFinger() {
  const nav = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [events, setEvents] = useState<EventObj[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [fingeringData, setFingeringData] = useState<any[] | null>(null)
  const [totalCost, setTotalCost] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saveTitle, setSaveTitle] = useState<string>('')

  const eventsAsTuples = useMemo(() => {
    // Tuple format sent to backend. Notes may include a 4th field: slur_to_next (bool).
    return events.map((e) =>
      e.type === 'N'
        ? [e.type, e.beats, e.note ?? null, Boolean(e.slur_to_next)]
        : [e.type, e.beats, null]
    )
  }, [events])


  const doTranscribe = async () => {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const res = await transcribe(file)
      setEvents(res.events)
      setMeta(res.meta)
      setFingeringData(null)
      setTotalCost(null)
      setSaveTitle(file.name.replace(/\.[^.]+$/, ''))
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const doFinger = async () => {
    if (!events.length) return
    setBusy(true)
    setErr(null)
    try {
      const res = await finger(eventsAsTuples as any)
      setFingeringData(res.fingering)
      setTotalCost(res.total_cost)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const doSave = async () => {
    if (!fingeringData) return
    setBusy(true)
    setErr(null)
    try {
      const res = await createSave({
        title: saveTitle || 'Untitled',
        events: eventsAsTuples as any,
        fingering: fingeringData,
        score_filename: file?.name ?? null,
      })
      nav(`/saved/${res.id}`)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const loadDemo = () => {
    setEvents([
      { type: 'N', beats: 1, note: 'C4' },
      { type: 'N', beats: 0.5, note: 'B3' },
      { type: 'N', beats: 0.5, note: 'C4' },
      { type: 'N', beats: 1, note: 'G3' },
      { type: 'N', beats: 1, note: 'G3' },
      { type: 'N', beats: 1, note: 'A3' },
      { type: 'N', beats: 1, note: 'B3' },
      { type: 'N', beats: 1, note: 'C4' },
      { type: 'N', beats: 0.5, note: 'B3' },
      { type: 'N', beats: 0.5, note: 'C4' },
      { type: 'N', beats: 2, note: 'D4' },
    ])
    setMeta({ demo: true })
    setFingeringData(null)
    setTotalCost(null)
    setSaveTitle('demo')
  }

  const tupleToPy = (t: any[]) => {
    if (t[0] === 'N') {
      const note = t[2] == null ? 'None' : JSON.stringify(t[2])
      const slur = t[3] ? 'True' : 'False'
      return `(${JSON.stringify(t[0])}, ${t[1]}, ${note}, ${slur})`
    }
    return `(${JSON.stringify(t[0])}, ${t[1]}, None)`
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Upload Score</div>
            <div className="small">
              Upload MusicXML/MXL for immediate parsing.
            </div>
          </div>
          <button onClick={loadDemo}>Load demo</button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            type="file"
            accept=".musicxml,.xml,.mxl,.pdf,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className="primary" onClick={doTranscribe} disabled={!file || busy}>
            Transcribe
          </button>
          <button onClick={doFinger} disabled={!events.length || busy}>
            2) Compute fingering
          </button>
        </div>

        {err && <div className="small" style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}

        <div className="small" style={{ marginTop: 10 }}>
          {meta ? (
            <>
              <span style={{ fontWeight: 700 }}>OMR meta:</span> {JSON.stringify(meta)}
            </>
          ) : (
            'No transcription yet.'
          )}
        </div>

        {totalCost != null && (
          <div className="small" style={{ marginTop: 6 }}>
            <span style={{ fontWeight: 700 }}>Total cost:</span> {totalCost}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Save title"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button onClick={doSave} disabled={!fingeringData || busy}>
            Save fingering
          </button>
        </div>
      </div>

        <EventTable events={events} onChange={(x) => { setEvents(x); setFingeringData(null); setTotalCost(null) }} />


      {fingeringData ? <FingeringViewer fingering={fingeringData} /> : null}
    </div>
  )
}
