#!/usr/bin/env node
/**
 * Read-only health report for the diagnostic-tutor runtime.
 *
 * This is the support tool for "it got stuck": it reads the durable state file
 * and the local event journal, and reports the stage of each project, pending
 * or failed tutor requests, stalled attempts and recent events. It never
 * writes, never calls a model and never prints lesson/goal/evidence content.
 *
 * Usage:
 *   node scripts/doctor.mjs                 # default ~/.dsh (or $DSH_HOME)
 *   node scripts/doctor.mjs --json          # machine-readable report
 *   node scripts/doctor.mjs --storage <udt.json> [--journal <events.jsonl>]
 *   node scripts/doctor.mjs --strict        # exit 1 when an error-severity issue exists
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const STALE_REQUEST_MINUTES = 10
const STALLED_ATTEMPT_MINUTES = 15

function fail(message) {
  console.error(`doctor: ${message}`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = { json: false, strict: false, storage: undefined, journal: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--storage') options.storage = argv[++index]
    else if (arg === '--journal') options.journal = argv[++index]
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/doctor.mjs [--json] [--strict] [--storage <udt.json>] [--journal <events.jsonl>]')
      process.exit(0)
    } else fail(`unknown argument: ${arg}`)
  }
  return options
}

function minutesBetween(now, iso) {
  const at = Date.parse(iso)
  return Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60_000)) : 0
}

function briefReady(brief) {
  return brief !== null && brief !== undefined && typeof brief.purpose === 'string' && brief.purpose.length > 0
    && Array.isArray(brief.outcomes) && brief.outcomes.length > 0
}

function assessmentReady(path) {
  return path.assessment !== null && path.assessment !== undefined
    && path.assessment.briefRevision === path.briefRevision
    && (path.assessment.status === 'ready' || path.assessment.status === 'skipped')
}

function unresolved(request, path) {
  if (request.kind === 'diagnosis') {
    const assessment = path.assessment
    return assessment === null || assessment === undefined || assessment.status === 'in-progress'
      || assessment.updatedAt < request.createdAt
  }
  return !path.curricula.some((entry) => entry.createdAt >= request.createdAt)
}

async function tailJournal(file, limit = 20) {
  try {
    const text = await readFile(file, 'utf8')
    return text.split('\n').filter(Boolean).slice(-limit).map((line) => {
      try { return JSON.parse(line) } catch { return undefined }
    }).filter(Boolean)
  } catch {
    return []
  }
}

async function visit(storageFile, journalFile) {
  let document
  try {
    document = JSON.parse(await readFile(storageFile, 'utf8'))
  } catch (error) {
    fail(`cannot read storage "${storageFile}": ${error.message}`)
  }
  const tables = document.tables
  if (tables === null || typeof tables !== 'object') fail('storage has no tables')
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const courses = Object.values(tables.courses ?? {})
  const paths = new Map(Object.values(tables.learning_paths ?? {}).map((path) => [path.courseId, path]))
  const runs = new Map(Object.values(tables.course_runs ?? {}).map((run) => [run.courseId, run]))
  const issues = []
  const projects = []

  for (const course of [...courses].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const path = paths.get(course.id)
    if (path === undefined) {
      projects.push({
        courseId: course.id, title: course.title, stage: 'legacy', pending: [], activeAttempt: null,
        assessment: null, curricula: 0, acceptedVersion: null, completedItems: 0, totalItems: 0,
        totalMinutes: 0, sessionMinutes: null, overSessionItems: 0,
      })
      continue
    }
    const accepted = path.acceptedVersion !== null && path.curricula.some((entry) => entry.version === path.acceptedVersion)
    const stage = !briefReady(path.brief) ? 'goal' : !assessmentReady(path) ? 'diagnosis' : accepted ? 'learning' : 'route'
    const run = runs.get(course.id)
    const attempt = run?.attempts?.find((entry) => entry.id === run.activeAttemptId)
    const activeAttempt = attempt === undefined ? null : {
      attemptId: attempt.id, itemId: attempt.itemId, status: attempt.status,
      ageMinutes: minutesBetween(now, attempt.startedAt), units: attempt.units?.length ?? 0,
    }
    const pending = (path.requests ?? [])
      .filter((request) => request.prompted && ((request.failure ?? null) !== null || unresolved(request, path)))
      .map((request) => ({
        id: request.id, kind: request.kind, sessionId: request.sessionId,
        ageMinutes: minutesBetween(now, request.createdAt), prompted: request.prompted,
        failure: request.failure ?? null,
      }))
    const plan = path.curricula.find((entry) => entry.version === path.acceptedVersion) ?? path.curricula.at(-1)
    const completed = new Set((run?.attempts ?? []).filter((entry) => entry.status === 'completed').map((entry) => entry.itemId)).size
    const totalMinutes = (plan?.items ?? []).reduce((sum, item) => sum + (item.minutes?.min ?? 0), 0)
    projects.push({
      courseId: course.id, title: course.title, stage,
      assessment: path.assessment?.status ?? null,
      curricula: path.curricula.length, acceptedVersion: path.acceptedVersion,
      completedItems: completed, totalItems: plan?.items?.length ?? 0,
      totalMinutes, activeAttempt, pending,
      sessionMinutes: path.brief?.sessionMinutes ?? null,
      overSessionItems: (plan?.items ?? []).filter((item) => (item.minutes?.max ?? 0) > (path.brief?.sessionMinutes ?? Infinity)).length,
    })
    for (const request of pending) {
      if (request.failure !== null) {
        issues.push({ code: 'failed-turn', severity: 'error', courseId: course.id,
          message: `${request.kind} request ${request.id.slice(0, 8)} failed: ${request.failure.slice(0, 200)}` })
      } else if (request.ageMinutes >= STALE_REQUEST_MINUTES) {
        issues.push({ code: 'stale-request', severity: 'warn', courseId: course.id,
          message: `${request.kind} request ${request.id.slice(0, 8)} waiting ${request.ageMinutes} min without advancing` })
      }
    }
    if (path.acceptedVersion !== null && !accepted) {
      issues.push({ code: 'accepted-route-missing', severity: 'error', courseId: course.id,
        message: `acceptedVersion ${path.acceptedVersion} has no matching curriculum` })
    }
    if (activeAttempt !== null && activeAttempt.status !== 'completed' && activeAttempt.units === 0
      && activeAttempt.ageMinutes >= STALLED_ATTEMPT_MINUTES) {
      issues.push({ code: 'stalled-attempt', severity: 'warn', courseId: course.id,
        message: `lesson attempt ${activeAttempt.attemptId.slice(0, 8)} has no units after ${activeAttempt.ageMinutes} min` })
    }
  }

  const recent = await tailJournal(journalFile)
  return {
    ok: true,
    generatedAt: iso,
    plugin: { name: packageJson.name, version: packageJson.version },
    storage: { file: storageFile, unit: document.unit ?? null },
    counts: {
      courses: courses.length,
      nodes: Object.keys(tables.nodes ?? {}).length,
      lessons: Object.keys(tables.lessons ?? {}).length,
      focus: Object.keys(tables.focus ?? {}).length,
      projects: Object.keys(tables.session_projects ?? {}).length,
      learningPaths: Object.keys(tables.learning_paths ?? {}).length,
      courseRuns: Object.keys(tables.course_runs ?? {}).length,
      sources: Object.keys(tables.sources ?? {}).length,
      sourceBytes: Object.values(tables.sources ?? {}).reduce((sum, source) => sum + (Number(source.bytes) || 0), 0),
      tasks: Object.keys(tables.tasks ?? {}).length,
      reviewCards: Object.keys(tables.review_cards ?? {}).length,
    },
    issues,
    projects,
    journal: { file: journalFile, recent },
  }
}

function printHuman(report) {
  const lines = []
  lines.push(`diagnostic-tutor ${report.plugin.version} — ${report.generatedAt}`)
  lines.push(`storage: ${report.storage.file}`)
  lines.push(`counts: ${Object.entries(report.counts).map(([key, value]) => `${key}=${value}`).join(' ')}`)
  lines.push('')
  if (report.issues.length === 0) lines.push('issues: none')
  else {
    lines.push(`issues (${report.issues.length}):`)
    for (const issue of report.issues) {
      lines.push(`  [${issue.severity}] ${issue.code}${issue.courseId ? ` (${issue.courseId})` : ''}: ${issue.message}`)
    }
  }
  lines.push('')
  lines.push('projects:')
  for (const project of report.projects) {
    const attempt = project.activeAttempt
      ? ` attempt=${project.activeAttempt.status} units=${project.activeAttempt.units} ${project.activeAttempt.ageMinutes}min`
      : ' attempt=none'
    const pending = project.pending.length === 0 ? '' : ` pending=${project.pending.map((request) => `${request.kind}/${request.ageMinutes}min${request.failure ? '/failed' : ''}`).join(',')}`
    const route = project.totalItems === 0 ? '' : ` lessons=${project.completedItems}/${project.totalItems} planned=${Math.round(project.totalMinutes / 60)}h`
    lines.push(`  ${project.courseId} [${project.stage}] assessment=${project.assessment ?? 'none'} curricula=${project.curricula} accepted=${project.acceptedVersion ?? 'none'}${route}${attempt}${pending}`)
    if (project.overSessionItems > 0) {
      lines.push(`    ! ${project.overSessionItems} lesson(s) exceed the ${project.sessionMinutes}-minute session budget`)
    }
  }
  lines.push('')
  lines.push(`journal: ${report.journal.file} (${report.journal.recent.length} recent events)`)
  for (const event of report.journal.recent.slice(-8)) {
    lines.push(`  ${event.at} ${event.event}${event.tool ? ` tool=${event.tool}` : ''}${event.prompted === false ? ' prompted=false' : ''}${event.durationMs !== undefined ? ` ${event.durationMs}ms` : ''}`)
  }
  console.log(lines.join('\n'))
}

const options = parseArgs(process.argv.slice(2))
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const storage = options.storage ?? join(DSH_HOME, 'storages', 'udt.json')
const journal = options.journal ?? join(DSH_HOME, 'logs', 'diagnostic-tutor-events.jsonl')
const report = await visit(storage, journal)
if (options.json) console.log(JSON.stringify(report, null, 2))
else printHuman(report)
if (options.strict && report.issues.some((issue) => issue.severity === 'error')) process.exit(1)
