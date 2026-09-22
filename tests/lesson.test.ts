/**
 * Lesson and Learning Block schemas.
 *
 * The schema is the contract the renderer registry dispatches on, so it is
 * pinned here: the four supported types, the envelope shape, and the
 * determinism of the prototype builder.
 */

import { describe, expect, it } from 'vitest'

import {
  BLOCK_SCHEMAS,
  BlockSchema,
  LessonSchema,
  SUPPORTED_BLOCK_TYPES,
  buildPrototypeLesson,
} from '../src/lesson.js'
import { newNode } from '../src/state.js'
import type { CourseRecord, NodeRecord } from '../src/state.js'

const NOW = '2026-01-01T00:00:00.000Z'

const course: CourseRecord = {
  id: 'ml',
  title: 'Machine Learning',
  goal: 'Learn ML from weak math foundations',
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
}

function map(): NodeRecord[] {
  return [
    newNode({
      id: 'ml:goal',
      courseId: 'ml',
      title: 'Machine Learning',
      relation: 'goal',
      evidence: [{ kind: 'goal-stated', at: NOW, note: 'I want to learn ML' }],
      now: NOW,
    }),
    newNode({
      id: 'ml:math',
      courseId: 'ml',
      title: 'Math Foundations',
      relation: 'prerequisite',
      parentId: 'ml:goal',
      state: 'blocked',
      evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky maths' }],
      now: NOW,
    }),
    newNode({
      id: 'ml:python',
      courseId: 'ml',
      title: 'Python',
      relation: 'prerequisite',
      parentId: 'ml:goal',
      now: NOW,
    }),
  ]
}

describe('block schema', () => {
  it('supports exactly the four v0.0.4 block types', () => {
    expect([...SUPPORTED_BLOCK_TYPES].sort()).toEqual(['check', 'diagram', 'example', 'text'])
    expect(BLOCK_SCHEMAS).toHaveLength(4)
  })

  it('accepts a well-formed block of each type', () => {
    const samples = [
      { id: 'a', type: 'text', content: { md: 'hello' } },
      { id: 'b', type: 'example', content: { title: 't', steps: ['one'] } },
      { id: 'c', type: 'diagram', content: { format: 'ascii', spec: 'x' } },
      { id: 'd', type: 'check', content: { prompt: 'q' } },
    ]
    for (const sample of samples) {
      expect(BlockSchema.safeParse(sample).success).toBe(true)
    }
  })

  it('rejects an unknown type rather than passing it through', () => {
    expect(BlockSchema.safeParse({ id: 'x', type: 'formula', content: { latex: 'x' } }).success).toBe(
      false,
    )
  })

  it('rejects a malformed payload for a known type', () => {
    // `steps` must be non-empty: an example with nothing in it teaches nothing.
    expect(
      BlockSchema.safeParse({ id: 'b', type: 'example', content: { title: 't', steps: [] } }).success,
    ).toBe(false)
    expect(BlockSchema.safeParse({ id: 'a', type: 'text', content: { md: '' } }).success).toBe(false)
  })

  it('strips unknown envelope fields instead of storing them', () => {
    const parsed = BlockSchema.safeParse({
      id: 'a',
      type: 'text',
      content: { md: 'hi' },
      score: 91,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'score' in parsed.data).toBe(false)
  })
})

describe('lesson schema', () => {
  it('requires at least one block', () => {
    const result = LessonSchema.safeParse({
      id: 'l',
      courseId: 'ml',
      nodeId: 'ml:math',
      title: 't',
      blocks: [],
      origin: 'prototype',
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(result.success).toBe(false)
  })

  it('records the origin, so a prototype cannot be mistaken for generated teaching', () => {
    const result = LessonSchema.safeParse({
      id: 'l',
      courseId: 'ml',
      nodeId: 'ml:math',
      title: 't',
      blocks: [{ id: 'a', type: 'text', content: { md: 'hi' } }],
      origin: 'something-else',
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(result.success).toBe(false)
  })
})

describe('prototype lesson', () => {
  const nodes = map()
  const target = nodes[1] as NodeRecord
  const lesson = buildPrototypeLesson({ course, node: target, nodes, now: NOW })

  it('is a valid lesson', () => {
    expect(LessonSchema.safeParse(lesson).success).toBe(true)
    expect(lesson.origin).toBe('prototype')
  })

  it('exercises all four block types', () => {
    expect(lesson.blocks.map((block) => block.type)).toEqual(['text', 'example', 'diagram', 'check'])
  })

  it('is deterministic', () => {
    const again = buildPrototypeLesson({ course, node: target, nodes, now: NOW })
    expect(again).toEqual(lesson)
  })

  it('projects stored state rather than inventing content', () => {
    // Every fact in the lesson must be traceable to the record it came from.
    const text = lesson.blocks[0]
    expect(text?.type === 'text' && text.content.md).toContain('Math Foundations')
    expect(text?.type === 'text' && text.content.md).toContain('blocked')

    const example = lesson.blocks[1]
    expect(example?.type === 'example' && example.content.steps[0]).toContain('shaky maths')

    const diagram = lesson.blocks[2]
    expect(diagram?.type === 'diagram' && diagram.content.spec).toContain('Machine Learning')
    expect(diagram?.type === 'diagram' && diagram.content.spec).toContain('◀ this node')
  })

  it('ends on a check that waits for the learner', () => {
    const check = lesson.blocks[3]
    expect(check?.type).toBe('check')
    expect(check?.type === 'check' && check.content.expect).toBe('reasoning')
    expect(check?.metadata?.stopAndWait).toBe(true)
  })

  it('says so plainly when a node has no evidence', () => {
    const bare = nodes[2] as NodeRecord
    const built = buildPrototypeLesson({ course, node: bare, nodes, now: NOW })
    const example = built.blocks[1]
    expect(example?.type === 'example' && example.content.steps[0]).toContain('No observation')
  })
})
