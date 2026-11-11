import { describe, expect, it } from 'vitest'
import { pickActiveLessonUnit } from '../src/client/lesson-units.js'

const lesson = (id: string, blockId: string) => ({ id, blocks: [{ id: blockId }] }) as any
const units = [ { lesson: lesson('u1', 'scene-1') }, { lesson: lesson('u2', 'read-1') } ]

describe('active lesson unit after tutor append', () => {
  it('keeps the unit containing the stored Study block', () => {
    expect(pickActiveLessonUnit(units, { blockId: 'scene-1', stepIndex: 0 } as any)?.lesson.id).toBe('u1')
  })
  it('uses the latest unit when the stored block is gone or absent', () => {
    expect(pickActiveLessonUnit(units, { blockId: 'deleted', stepIndex: 0 } as any)?.lesson.id).toBe('u2')
    expect(pickActiveLessonUnit(units, undefined)?.lesson.id).toBe('u2')
  })
})
