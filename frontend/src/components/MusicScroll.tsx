import React, { useEffect, useMemo, useRef } from 'react'

type Item = any

function isNote(x: Item): boolean {
  return x && x.type === 'N'
}

function prettyLabel(item: Item): string {
  if (!item) return ''
  if (item.type === 'R') return 'Rest'
  const note = item.note ?? ''
  const finger = item.finger != null ? ` f${item.finger}` : ''
  const string = item.string ? ` ${item.string}` : ''
  return `${note}${string}${finger}`.trim()
}

export default function MusicScroll({
  fingering,
  index,
  onSelect,
}: {
  fingering: Item[]
  index: number
  onSelect: (i: number) => void
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const el = refs.current[index]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  const widths = useMemo(() => {
    // Give longer notes more horizontal space, but keep it bounded.
    return fingering.map((it) => {
      const beats = Number(it?.duration_beats ?? 1)
      const w = 56 + Math.min(140, Math.max(0, beats - 1) * 60)
      return Math.round(w)
    })
  }, [fingering])

  if (!fingering || fingering.length === 0) return null

  return (
    <div className="musicScroll" role="list" aria-label="Music scroll">
      {fingering.map((it, i) => {
        const active = i === index
        const label = prettyLabel(it)
        const beats = Number(it?.duration_beats ?? 1)
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={'musicItem ' + (active ? 'active' : '')}
            role="listitem"
            style={{ minWidth: widths[i] }}
            onClick={() => onSelect(i)}
            title={label}
          >
            <div className="musicStaff">
              {/* “Rendered” staff feel: note-head-like dot + stem */}
              <div className="noteGlyph">
                <div className={'noteHead ' + (isNote(it) ? '' : 'rest')}></div>
                {isNote(it) ? <div className="noteStem"></div> : null}
              </div>
            </div>
            <div className="musicLabel">
              <div style={{ fontWeight: 700, fontSize: 12 }}>{label || (it?.type === 'R' ? 'Rest' : '—')}</div>
              <div className="small">{beats} beat{beats === 1 ? '' : 's'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
