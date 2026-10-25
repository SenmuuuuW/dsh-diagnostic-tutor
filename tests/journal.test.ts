/** Local monitoring must be cheap, content-free and never break the runtime. */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openJournal } from '../src/journal.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udt-journal-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('the local event journal', () => {
  it('appends content-free events and reads the newest tail back', async () => {
    const file = join(dir, 'events.jsonl')
    const journal = openJournal({ file, now: () => new Date('2026-01-01T00:00:00.000Z') })
    expect(journal.file).toBe(file)
    journal.append('plugin.ready', { tools: 9, version: '0.1.1' })
    journal.append('tool.call', { tool: 'udt_path_update', op: 'propose' })

    const tail = await journal.tail(10)
    expect(tail).toHaveLength(2)
    expect(tail[0]).toMatchObject({ at: '2026-01-01T00:00:00.000Z', event: 'plugin.ready', tools: 9 })
    expect(tail[1]).toMatchObject({ event: 'tool.call', op: 'propose' })
    const raw = await readFile(file, 'utf8')
    expect(raw.trim().split('\n')).toHaveLength(2)
  })

  it('rotates once at the size cap instead of growing forever', async () => {
    const file = join(dir, 'events.jsonl')
    const journal = openJournal({ file, maxBytes: 60 })
    journal.append('a', { pad: 'x'.repeat(80) })
    journal.append('b', { pad: 'y'.repeat(80) })
    await journal.tail(1)

    const rotated = await stat(`${file}.1`)
    expect(rotated.size).toBeGreaterThan(0)
    const tail = await journal.tail(10)
    expect(tail).toHaveLength(1)
    expect(tail[0]?.event).toBe('b')
  })

  it('is a no-op when disabled, and a torn line does not hide the rest', async () => {
    const disabled = openJournal({ file: null })
    expect(disabled.file).toBeNull()
    disabled.append('never')
    expect(await disabled.tail()).toEqual([])

    const file = join(dir, 'events.jsonl')
    const journal = openJournal({ file })
    journal.append('one')
    await journal.tail()
    const { appendFile } = await import('node:fs/promises')
    await appendFile(file, '{"broken":\n', 'utf8')
    expect((await journal.tail(10)).map((event) => event.event)).toEqual(['one'])
  })
})
