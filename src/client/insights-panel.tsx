/** The Insights tab: read-only facts. No score, percentage or mastery claim. */
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { InsightsView } from '../contract.js'
import { useDesignText } from './design-text.js'
import { Icon } from './design-icons.jsx'
import type { PathClient } from './path-client.js'

function when(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) } catch { return iso }
}

export function InsightsPage({ client, courseId, onOpenReview, onOpenRoute }: {
  client: PathClient
  courseId: string
  onOpenReview?: (() => void) | undefined
  onOpenRoute?: (() => void) | undefined
}): ReactNode {
  const text = useDesignText()
  const [data, setData] = useState<InsightsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (client.insights === undefined) { setLoading(false); return }
    setLoading(true); setError('')
    try { setData(await client.insights(courseId)) } catch (cause) { setError(cause instanceof Error ? cause.message : text.insightsFailed) } finally { setLoading(false) }
  }, [client, courseId, text.insightsFailed])
  useEffect(() => { void load() }, [load])

  return (
    <div className="dtx-insights">
      <header className="dtx-insights-head">
        <div>
          <p className="dtx-insights-eyebrow">{text.insightsEyebrow}</p>
          <h1>{text.insightsTitle}</h1>
          <p className="dtx-insights-sub">{text.insightsSub}</p>
        </div>
        {onOpenRoute !== undefined && <button type="button" className="dtx-link" onClick={onOpenRoute}>{text.backToRoute}</button>}
      </header>
      {loading && <p className="dtx-status">{text.insightsLoading}</p>}
      {error !== '' && <div className="dtx-alert" role="alert">{error} <button type="button" className="dtx-link" onClick={() => void load()}>{text.reviewRetry}</button></div>}
      {data !== null && (
        <div className="dtx-insights-grid">
          <section className="dtx-insight-card dtx-insight-review">
            <h2><Icon name="layers" size={16} /> {text.insightsReview}</h2>
            <p className="dtx-insight-big">{data.review.due}</p>
            <p className="dtx-insight-note">{text.insightsReviewDue(data.review.overdue, data.review.total)}</p>
            {data.review.lapsed.length > 0 && <>
              <h3>{text.insightsLapsed}</h3>
              <ul>{data.review.lapsed.map((card) => <li key={card.id}><span>{card.front}</span><b>{card.lapses}×</b></li>)}</ul>
            </>}
            {onOpenReview !== undefined && <button type="button" className="dtx-link" onClick={onOpenReview}>{text.insightsGoReview}</button>}
          </section>
          <section className="dtx-insight-card">
            <h2><Icon name="check" size={16} /> {text.insightsEvidence}</h2>
            <p className="dtx-insight-big">{data.evidence.total}</p>
            <p className="dtx-insight-note">{text.insightsLast7(data.evidence.last7Days)}</p>
            <div className="dtx-insight-chips">{data.evidence.byKind.map((entry) => <span key={entry.kind}>{entry.kind} · {entry.count}</span>)}</div>
          </section>
          <section className="dtx-insight-card">
            <h2><Icon name="warning" size={16} /> {text.insightsWeakNodes}</h2>
            {data.weakNodes.length === 0 ? <p className="dtx-insight-note">{text.insightsNoWeak}</p> : <ul className="dtx-insight-lines">{data.weakNodes.map((node) => <li key={node.id}><span>{node.title}</span><b>{node.state} · {text.insightsEvidenceCount(node.evidenceCount)}</b></li>)}</ul>}
          </section>
          <section className="dtx-insight-card">
            <h2><Icon name="clock" size={16} /> {text.insightsRecentReviews}</h2>
            {data.recentReviews.length === 0 ? <p className="dtx-insight-note">{text.insightsNoneYet}</p> : <ul className="dtx-insight-lines">{data.recentReviews.slice(0, 5).map((entry, index) => <li key={`${entry.at}:${index}`}><span>{entry.front}</span><b>{entry.rating} · {when(entry.at)}</b></li>)}</ul>}
          </section>
          <section className="dtx-insight-card">
            <h2><Icon name="book" size={16} /> {text.insightsActivity}</h2>
            {data.recentAttempts.length === 0 ? <p className="dtx-insight-note">{text.insightsNoneYet}</p> : <ul className="dtx-insight-lines">{data.recentAttempts.map((attempt) => <li key={attempt.attemptId}><span>{attempt.status}</span><b>{text.insightsAttemptDetail(attempt.units, attempt.responses)} · {when(attempt.updatedAt)}</b></li>)}</ul>}
            <p className="dtx-insight-note">{text.insightsPlan(data.tasks.open, data.tasks.dueToday)} · {text.insightsSources(data.sources.count)}</p>
          </section>
        </div>
      )}
    </div>
  )
}
