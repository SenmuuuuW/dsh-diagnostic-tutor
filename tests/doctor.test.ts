/** Doctor is a read-only support tool; it must read a real document and report. */

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/doctor.mjs', import.meta.url))

let dir: string
let storage: string
let journal: string

function document(requests: unknown[]): string {
  const createdAt = new Date(Date.now() - 60 * 60_000).toISOString()
  return JSON.stringify({
    unit: { name: 'udt', version: 1 },
    global: { preferredLanguage: null, activeCourseId: 'ml', initializedAt: createdAt, updatedAt: createdAt },
    tables: {
      courses: { ml: { id: 'ml', title: 'Machine Learning', goal: 'Learn ML', status: 'active', createdAt, updatedAt: createdAt } },
      nodes: {},
      lessons: {},
      focus: {},
      next_steps: {},
      handoffs: {},
      session_projects: { s1: { sessionId: 's1', courseId: 'ml', selectedAt: createdAt } },
      learning_paths: {
        ml: {
          courseId: 'ml', revision: 3, briefRevision: 1, assessmentRevision: 0,
          brief: { purpose: 'Learn ML', outcomes: ['Build one model'], background: '', timeZone: 'UTC', targetDate: null, durationWeeks: null, deadline: 'none', weeklyMinutes: 120, sessionMinutes: 30, preferences: '' },
          assessment: null, curricula: [], acceptedVersion: null, requests, updatedAt: createdAt,
        },
      },
      course_runs: {},
    },
  })
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udt-doctor-'))
  storage = join(dir, 'udt.json')
  journal = join(dir, 'events.jsonl')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('scripts/doctor.mjs', () => {
  it('reports project stage, stale requests and counts as JSON', async () => {
    const createdAt = new Date(Date.now() - 60 * 60_000).toISOString()
    await writeFile(storage, document([
      { id: 'req-1', sessionId: 's1', kind: 'diagnosis', briefRevision: 1, createdAt, prompted: true, reason: null, failure: null },
    ]), 'utf8')
    await writeFile(journal, `${JSON.stringify({ at: createdAt, event: 'path.request', kind: 'diagnosis', prompted: true })}\n`, 'utf8')

    const { stdout } = await execFileAsync(process.execPath, [script, '--storage', storage, '--journal', journal, '--json'])
    const report = JSON.parse(stdout) as {
      ok: boolean
      counts: { courses: number; learningPaths: number }
      projects: { courseId: string; stage: string; pending: { kind: string; ageMinutes: number }[] }[]
      issues: { code: string }[]
      journal: { recent: { event: string }[] }
    }
    expect(report.ok).toBe(true)
    expect(report.counts).toMatchObject({ courses: 1, learningPaths: 1 })
    expect(report.projects[0]).toMatchObject({ courseId: 'ml', stage: 'diagnosis' })
    expect(report.projects[0]?.pending[0]).toMatchObject({ kind: 'diagnosis' })
    expect(report.projects[0]?.pending[0]?.ageMinutes).toBeGreaterThanOrEqual(59)
    expect(report.issues.map((issue) => issue.code)).toContain('stale-request')
    expect(report.journal.recent[0]?.event).toBe('path.request')
  })

  it('exits 1 under --strict when a failed turn is recorded', async () => {
    const createdAt = new Date(Date.now() - 5 * 60_000).toISOString()
    await writeFile(storage, document([
      { id: 'req-2', sessionId: 's1', kind: 'diagnosis', briefRevision: 1, createdAt, prompted: true, reason: null, failure: 'insufficient balance' },
    ]), 'utf8')
    await expect(execFileAsync(process.execPath, [script, '--storage', storage, '--journal', journal, '--json', '--strict']))
      .rejects.toMatchObject({ code: 1 })
  })

  it('fails cleanly when the storage document is missing', async () => {
    await expect(execFileAsync(process.execPath, [script, '--storage', join(dir, 'missing.json'), '--json']))
      .rejects.toMatchObject({ code: 2 })
  })
})
