/**
 * Local, content-free event journal for the tutoring flow.
 *
 * Monitoring has to answer "where did it get stuck?" without harvesting the
 * learner's chat. This journal therefore stores only lifecycle facts: the
 * event name, ids, stage/op names, durations and error messages — never lesson
 * text, goals, evidence notes or model replies.
 *
 * The file is local to the machine, size-capped and rotated once. Writing is
 * best-effort and serialised: monitoring must never fail the thing it observes.
 */

import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Environment override: a file path, or `off` to disable the journal. */
export const JOURNAL_ENV = 'DSH_DIAGNOSTIC_TUTOR_EVENTS'

/** One stored line. `fields` are flat, content-free json scalars. */
export interface JournalEvent {
  readonly at: string
  readonly event: string
  readonly [field: string]: unknown
}

/** The append/tail surface diagnostics and the plugin use. */
export interface Journal {
  /** `null` when the journal is disabled. */
  readonly file: string | null
  /** Append one event. Never throws and never blocks the caller. */
  append(event: string, fields?: Readonly<Record<string, unknown>>): void
  /** The newest events, oldest first. */
  tail(limit?: number): Promise<JournalEvent[]>
}

/** Default cap per file, and the file kept beside it after rotation. */
export const JOURNAL_MAX_BYTES = 1_000_000

interface JournalOptions {
  /** Explicit file; `null` disables. Defaults to the environment rule. */
  readonly file?: string | null
  /** Override for tests. */
  readonly maxBytes?: number
  /** Clock override for tests. */
  readonly now?: () => Date
}

/**
 * Resolve the default journal file.
 *
 * `VITEST`/`NODE_ENV=test` disable the journal so the test suite never writes
 * into the developer's real `~/.dsh`. Explicit configuration always wins.
 *
 * @param env - environment to read.
 * @returns the file to append to, or `null` when disabled.
 */
export function defaultJournalFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env[JOURNAL_ENV]
  if (explicit === 'off' || explicit === '0') return null
  if (explicit !== undefined && explicit.length > 0) return explicit
  if (env.VITEST !== undefined || env.NODE_ENV === 'test') return null
  const home = env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'logs', 'diagnostic-tutor-events.jsonl')
}

/** Best-effort rotation: keep one previous file, reset the current one. */
async function rotate(file: string, bytes: number, maxBytes: number): Promise<number> {
  if (bytes < maxBytes) return bytes
  try {
    await rename(file, `${file}.1`)
  } catch {
    // Missing current file (or a concurrent rotation) is fine.
  }
  return 0
}

/**
 * Open the journal.
 *
 * @param options - file/maxBytes/clock overrides for tests.
 * @returns the journal handle; a disabled journal is a no-op.
 */
export function openJournal(options: JournalOptions = {}): Journal {
  const file = options.file === undefined ? defaultJournalFile() : options.file
  if (file === null) {
    return { file: null, append: () => {}, tail: async () => [] }
  }
  const maxBytes = options.maxBytes ?? JOURNAL_MAX_BYTES
  const now = options.now ?? (() => new Date())
  let bytes: number | null = null
  let chain: Promise<void> = Promise.resolve()

  const write = async (event: string, fields: Readonly<Record<string, unknown>>): Promise<void> => {
    let line: string
    try {
      line = JSON.stringify({ at: now().toISOString(), event, ...fields }) + '\n'
    } catch {
      return // A non-serialisable field must not break monitoring.
    }
    try {
      await mkdir(dirname(file), { recursive: true })
      if (bytes === null) {
        try { bytes = (await stat(file)).size } catch { bytes = 0 }
      }
      bytes = await rotate(file, bytes, maxBytes)
      await appendFile(file, line, 'utf8')
      bytes += Buffer.byteLength(line)
    } catch {
      // Local diagnostics are never allowed to fail the runtime.
    }
  }

  return {
    file,
    append(event, fields = {}) {
      chain = chain.then(() => write(event, fields))
    },
    async tail(limit = 50) {
      await chain
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch {
        return []
      }
      const lines = text.split('\n').filter((line) => line.length > 0)
      const events: JournalEvent[] = []
      for (const line of lines.slice(-Math.max(1, limit))) {
        try {
          const parsed = JSON.parse(line) as JournalEvent
          if (typeof parsed.event === 'string') events.push(parsed)
        } catch {
          // A torn line is skipped; the rest of the journal still reads.
        }
      }
      return events
    },
  }
}
