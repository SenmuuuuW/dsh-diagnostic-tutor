/** Model-facing plan items. Planning is runtime policy, not a teaching decision. */
import { randomUUID } from 'node:crypto'

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { MAX_TASKS, TaskInputSchema, sortTasks, taskView } from './plan.js'
import type { TaskInput, TaskRecord } from './plan.js'
import type { UdState } from './state.js'

function output() {
  return { schema: { type: 'object', additionalProperties: true } as const, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function validateInput(state: UdState, raw: unknown, index: number): TaskInput {
  const input = TaskInputSchema.parse(raw)
  if (input.dueAt !== undefined && !Number.isFinite(Date.parse(input.dueAt))) throw new Error(`task[${index}] has an invalid dueAt`)
  if (input.courseId !== undefined) {
    const course = state.readCourse(input.courseId)
    if (course === undefined) throw new Error(`task[${index}] references an unknown course`)
    if (input.nodeId !== undefined && state.readNode(input.nodeId)?.courseId !== input.courseId) throw new Error(`task[${index}] references a node outside the course`)
  } else if (input.nodeId !== undefined) {
    throw new Error(`task[${index}] cannot name a node without its course`)
  }
  if (input.sourceId !== undefined && state.readSource(input.sourceId) === undefined) throw new Error(`task[${index}] references an unknown source`)
  return input
}

function materialize(input: TaskInput, now: string): TaskRecord {
  return {
    id: randomUUID(), title: input.title, status: 'open', createdAt: now, updatedAt: now,
    ...(input.courseId === undefined ? {} : { courseId: input.courseId }),
    ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
    ...(input.estimateMin === undefined ? {} : { estimateMin: input.estimateMin }),
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
  }
}

export function planTools(state: UdState): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_plan_get',
      description: 'Read the learner-owned Today plan: open first, dated tasks in due order, then undated tasks. Plan items are not teaching decisions and do not change knowledge state.',
      parameters: {},
      output: output(),
      execute: async () => JSON.parse(JSON.stringify({ now: new Date().toISOString(), tasks: sortTasks(state.listTasks()).map((task) => taskView(task)) })) as Record<string, never>,
    }),
    defineTool({
      name: 'udt_plan_update',
      description:
        'Maintain the learner-visible Today plan. Planning is runtime policy, not a teaching judgement: it does not change a node state, complete a lesson or call a model. ' +
        'op=add creates tasks (title, optional courseId/nodeId/dueAt/estimateMin/sourceId); op=complete marks one done; op=remove deletes one. ' +
        'Use a real ISO date-time for dueAt; tasks without dueAt stay in Today but are not in the ICS calendar. Never invent a sourceId.',
      parameters: {
        op: { type: 'string', required: true, enum: ['add', 'complete', 'remove'] },
        tasks: { type: 'array', description: 'For op=add: one or more tasks.' },
        taskId: { type: 'string', description: 'For op=complete/remove.' },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { op?: string; tasks?: unknown; taskId?: string }
        const now = new Date().toISOString()
        if (input.op === 'add') {
          if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error('plan-add-needs-tasks')
          if (state.listTasks().length + input.tasks.length > MAX_TASKS) throw new Error('too-many-tasks: remove or complete old tasks first')
          const materialized = input.tasks.map((candidate, index) => materialize(validateInput(state, candidate, index), now))
          for (const task of materialized) await state.writeTask(task)
          return JSON.parse(JSON.stringify({ ok: true, tasks: sortTasks(state.listTasks()).map((task) => taskView(task)) })) as Record<string, never>
        }
        if (input.op === 'complete' || input.op === 'remove') {
          const taskId = input.taskId
          if (taskId === undefined) throw new Error('plan-update-needs-taskId')
          const task = state.readTask(taskId)
          if (task === undefined) throw new Error('no-such-task: read udt_plan_get')
          if (input.op === 'complete') {
            await state.writeTask({ ...task, status: 'done', updatedAt: now })
          } else {
            await state.deleteTask(taskId)
          }
          return JSON.parse(JSON.stringify({ ok: true, tasks: sortTasks(state.listTasks()).map((task) => taskView(task)) })) as Record<string, never>
        }
        throw new Error('unknown-plan-operation')
      },
    }),
  ]
}
