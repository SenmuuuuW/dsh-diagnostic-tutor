/** The learner's Today card: plan items and a calendar export. No teaching judgement. */
import type { ReactNode } from 'react'

import type { TaskView } from '../contract.js'
import { useDesignText } from './design-text.js'
import { useLang } from './i18n.js'
import { Icon } from './design-icons.jsx'

function dueLabel(value: string, lang: 'en' | 'zh'): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date)
  } catch { return value }
}

export function TodayCard({ tasks, onExport }: { tasks: readonly TaskView[]; onExport?: (() => void) | undefined }): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const open = tasks.filter((task) => task.status === 'open')
  if (open.length === 0) return null
  return (
    <section className="dtx-today" aria-label={text.today}>
      <div className="dtx-today-head">
        <div>
          <p className="dtx-today-eyebrow">{text.today}</p>
          <h2>{text.todayTitle(open.length)}</h2>
        </div>
        {onExport !== undefined && (
          <button type="button" className="dtx-link" onClick={onExport}>
            <Icon name="clock" size={14} /> {text.exportCalendar}
          </button>
        )}
      </div>
      <ul className="dtx-today-list">
        {open.slice(0, 3).map((task) => (
          <li key={task.id} className="dtx-today-task">
            <span className="dtx-today-dot" aria-hidden="true" />
            <span className="dtx-today-title">{task.title}</span>
            {task.dueAt !== undefined && <span className="dtx-today-due">{dueLabel(task.dueAt, lang)}{task.estimateMin === undefined ? '' : ` · ${task.estimateMin} min`}</span>}
          </li>
        ))}
      </ul>
      {open.length > 3 && <p className="dtx-today-more">{text.todayMore(open.length - 3)}</p>}
    </section>
  )
}
