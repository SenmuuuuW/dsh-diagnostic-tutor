import type { LessonRecord } from '../lesson.js'
import type { StudyProgress } from '../path.js'

export interface ActiveLessonUnit {
  readonly lesson: LessonRecord
}

/**
 * Keep the learner on the unit that contains their stored Study block when the
 * tutor appends teaching for another node. Falling back to the latest unit is
 * correct only when there is no progress or the old block is gone.
 */
export function pickActiveLessonUnit<T extends ActiveLessonUnit>(
  units: readonly T[],
  study: StudyProgress | undefined,
): T | undefined {
  if (units.length === 0) return undefined
  const blockId = study?.blockId
  if (blockId !== undefined) {
    const current = units.find((unit) => unit.lesson.blocks.some((block) => block.id === blockId))
    if (current !== undefined) return current
  }
  return units.at(-1)
}
