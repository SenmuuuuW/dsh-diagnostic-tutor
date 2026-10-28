/** The Review tab: due cards, reveal and four grades. Scheduling only. */
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { ReviewCardView } from '../contract.js'
import { useDesignText } from './design-text.js'
import type { PathClient } from './path-client.js'
import { Icon } from './design-icons.jsx'

export function ReviewPage({ client, onOpenRoute }: { client: PathClient; onOpenRoute?: (() => void) | undefined }): ReactNode {
  const text = useDesignText()
  const [cards, setCards] = useState<ReviewCardView[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (client.reviewNext === undefined) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const result = await client.reviewNext()
      setCards(result.cards)
      setRevealed(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.reviewFailed)
    } finally { setLoading(false) }
  }, [client, text.reviewFailed])
  useEffect(() => { void load() }, [load])

  const card = cards[0]
  const grade = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (client.reviewGrade === undefined || card === undefined || busy) return
    setBusy(true); setError('')
    try {
      const result = await client.reviewGrade({ cardId: card.id, rating })
      setUndo(card.id)
      setCards((current) => current.slice(1))
      setRevealed(false)
      if (result.remaining > 0) void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.reviewFailed)
    } finally { setBusy(false) }
  }

  return (
    <div className="dtx-review">
      <header className="dtx-review-head">
        <div>
          <p className="dtx-review-eyebrow">{text.reviewEyebrow}</p>
          <h1>{text.reviewTitle}</h1>
          <p className="dtx-review-sub">{text.reviewSub}</p>
        </div>
        {onOpenRoute !== undefined && <button type="button" className="dtx-link" onClick={onOpenRoute}>{text.backToRoute}</button>}
      </header>
      {loading && <p className="dtx-status">{text.reviewLoading}</p>}
      {error !== '' && <div className="dtx-alert" role="alert">{error} <button type="button" className="dtx-link" onClick={() => void load()}>{text.reviewRetry}</button></div>}
      {undo !== null && <div className="dtx-review-undo" role="status"><span>{text.reviewUndone}</span><button type="button" className="dtx-link" onClick={() => { void (async () => { if (client.reviewUndo === undefined) return; try { await client.reviewUndo(undo); setUndo(null); await load() } catch { setError(text.reviewUndoFailed) } })() }}>{text.reviewUndo}</button></div>}
      {!loading && error === '' && card === undefined && (
        <div className="dtx-review-empty">
          <span className="dtx-tab-empty-icon"><Icon name="check" size={30} /></span>
          <h2>{text.reviewEmpty}</h2>
          <p>{text.reviewEmptyBody}</p>
          {onOpenRoute !== undefined && <button type="button" className="dtx-primary" onClick={onOpenRoute}>{text.backToRoute}</button>}
        </div>
      )}
      {card !== undefined && (
        <section className="dtx-review-card" aria-label={text.reviewTitle}>
          <p className="dtx-review-count">{text.reviewDue(cards.length)}</p>
          <div className="dtx-review-front">{card.front}</div>
          {!revealed
            ? <button type="button" className="dtx-secondary" onClick={() => setRevealed(true)}>{text.reviewShowBack}</button>
            : <>
                <div className="dtx-review-back">{card.back}</div>
                {card.sourceRefs !== undefined && <p className="dtx-caption">{text.sourceRef} · {card.sourceRefs.map((ref) => ref.locator).join(' · ')}</p>}
                <div className="dtx-review-grades">
                  <button type="button" className="dtx-grade dtx-grade-again" disabled={busy} onClick={() => void grade('again')}>{text.reviewAgain}<span>{text.reviewAgainHint}</span></button>
                  <button type="button" className="dtx-grade dtx-grade-hard" disabled={busy} onClick={() => void grade('hard')}>{text.reviewHard}<span>{text.reviewHardHint}</span></button>
                  <button type="button" className="dtx-grade dtx-grade-good" disabled={busy} onClick={() => void grade('good')}>{text.reviewGood}<span>{text.reviewGoodHint}</span></button>
                  <button type="button" className="dtx-grade dtx-grade-easy" disabled={busy} onClick={() => void grade('easy')}>{text.reviewEasy}<span>{text.reviewEasyHint}</span></button>
                </div>
              </>}
          {cards.length > 1 && <p className="dtx-review-more">{text.reviewMore(cards.length - 1)}</p>}
        </section>
      )}
    </div>
  )
}
