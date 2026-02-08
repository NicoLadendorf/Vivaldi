export type EventObj = { type: 'N' | 'R'; beats: number; note?: string | null; slur_to_next?: boolean }

export type TranscribeResponse = {
  events_tuples: [string, number, string | null][]
  events: EventObj[]
  meta: any
}

export type FingerResponse = {
  fingering: any[]
  total_cost: number
}

export type SaveSummary = {
  id: string
  title: string
  created_at: string
  updated_at?: string
  last_reviewed?: string | null
  review_count?: number
  score_filename?: string | null
  num_events: number
}

export type SaveDetail = {
  id: string
  title: string
  created_at: string
  updated_at?: string
  last_reviewed?: string | null
  review_count?: number
  score_filename?: string | null
  events: any[]
  fingering: any[]
}

export async function transcribe(file: File): Promise<TranscribeResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
  if (!res.ok) throw new Error((await res.json()).error || 'transcribe failed')
  return res.json()
}

export async function finger(events: any[]): Promise<FingerResponse> {
  const res = await fetch('/api/finger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'finger failed')
  return res.json()
}

export async function listSaves(): Promise<SaveSummary[]> {
  const res = await fetch('/api/saves')
  if (!res.ok) throw new Error('list saves failed')
  return res.json()
}

export async function getSave(id: string): Promise<SaveDetail> {
  const res = await fetch(`/api/saves/${id}`)
  if (!res.ok) throw new Error('get save failed')
  return res.json()
}

export async function createSave(payload: { title: string; events: any[]; fingering: any[]; score_filename?: string | null }): Promise<{ id: string }> {
  const res = await fetch('/api/saves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'save failed')
  return res.json()
}

export async function updateSave(
  id: string,
  payload: { title?: string; events?: any[]; fingering?: any[]; score_filename?: string | null }
): Promise<void> {
  const res = await fetch(`/api/saves/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'update failed')
}

export async function markReviewed(id: string): Promise<{ last_reviewed: string; review_count: number }> {
  const res = await fetch(`/api/saves/${id}/review`, { method: 'POST' })
  if (!res.ok) throw new Error((await res.json()).error || 'review failed')
  return res.json()
}

export async function deleteSave(id: string): Promise<void> {
  const res = await fetch(`/api/saves/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('delete failed')
}
