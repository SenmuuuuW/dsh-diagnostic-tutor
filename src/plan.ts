/** Learner-owned plan items and ICS projection. No teaching decisions. */
import { z } from 'zod'

export const TASK_STATUSES = ['open', 'done', 'archived'] as const
export const TASKS_TABLE = 'tasks'
export const MAX_TASKS = 200
export const MAX_TASK_TITLE_CHARS = 200
export const MAX_TASK_ESTIMATE_MINUTES = 480
export const MIN_TASK_ESTIMATE_MINUTES = 5

export const TaskSchema = z.object({
  id: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(MAX_TASK_TITLE_CHARS),
  /** ISO date-time; omitted tasks stay visible in Today but cannot be exported to a calendar. */
  dueAt: z.string().min(1).max(80).optional(),
  estimateMin: z.number().int().min(MIN_TASK_ESTIMATE_MINUTES).max(MAX_TASK_ESTIMATE_MINUTES).optional(),
  sourceId: z.string().min(1).max(120).optional(),
  status: z.enum(TASK_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict()
export type TaskRecord = z.infer<typeof TaskSchema>
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TaskInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TASK_TITLE_CHARS),
  courseId: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(120).optional(),
  dueAt: z.string().min(1).max(80).optional(),
  estimateMin: z.number().int().min(MIN_TASK_ESTIMATE_MINUTES).max(MAX_TASK_ESTIMATE_MINUTES).optional(),
  sourceId: z.string().min(1).max(120).optional(),
}).strict()
export type TaskInput = z.infer<typeof TaskInputSchema>

/** The panel's task shape; no content that belongs to the model. */
export interface TaskView {
  id: string
  courseId?: string
  nodeId?: string
  title: string
  dueAt?: string
  estimateMin?: number
  sourceId?: string
  status: TaskStatus
  createdAt: string
}

export function taskView(task: TaskRecord): TaskView {
  return {
    id: task.id, title: task.title, status: task.status, createdAt: task.createdAt,
    ...(task.courseId === undefined ? {} : { courseId: task.courseId }),
    ...(task.nodeId === undefined ? {} : { nodeId: task.nodeId }),
    ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
    ...(task.estimateMin === undefined ? {} : { estimateMin: task.estimateMin }),
    ...(task.sourceId === undefined ? {} : { sourceId: task.sourceId }),
  }
}

/** Open tasks, earliest due first; undated tasks last. */
export function sortTasks(tasks: readonly TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'open' ? -1 : 1
    if (left.dueAt === undefined && right.dueAt === undefined) return left.createdAt.localeCompare(right.createdAt)
    if (left.dueAt === undefined) return 1
    if (right.dueAt === undefined) return -1
    return left.dueAt.localeCompare(right.dueAt)
  })
}

function icsDate(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/** Render open, dated tasks as one ICS calendar. */
export function buildIcs(tasks: readonly TaskRecord[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//dsh-diagnostic-tutor//plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const task of tasks) {
    if (task.status !== 'open' || task.dueAt === undefined) continue
    const start = new Date(task.dueAt)
    if (!Number.isFinite(start.getTime())) continue
    const end = new Date(start.getTime() + (task.estimateMin ?? 30) * 60_000)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsText(task.id)}@dsh-diagnostic-tutor`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(task.title)}`,
      ...(task.courseId === undefined ? [] : [`CATEGORIES:${icsText(task.courseId)}`]),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR', '')
  return lines.join('\r\n')
}
