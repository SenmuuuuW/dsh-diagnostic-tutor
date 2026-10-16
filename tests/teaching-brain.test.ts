import type { IncomingMessage, ServerResponse } from 'node:http'

import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { API_PREFIX, type WebServerLike } from '../src/api.js'
import * as plugin from '../src/index.js'
import { detectUdtSkill, teachingBrainForSession, UDT_SKILL_NAME } from '../src/udt.js'
import { createHarness, UDT_FIXTURE_CONTENT } from './harness.js'

/** Real registries and scope layers; Agent drivers are unnecessary for discovery. */
describe('live Agent teaching-brain availability', () => {
  let harness: Awaited<ReturnType<typeof createHarness>>
  let agents: AgentRegistry
  let handler: Parameters<WebServerLike['register']>[0]['handler']
  const cleanup: (() => unknown | Promise<unknown>)[] = []
  const scopes: Scope[] = []

  beforeEach(async () => {
    harness = await createHarness()
    const agentFiber = await harness.ctx.plugin(AgentRegistry)
    agents = harness.ctx.get('agents')!
    cleanup.push(() => agentFiber.dispose())
    const stopWeb = harness.ctx.provide('webServer', {
      register(options: Parameters<WebServerLike['register']>[0]) {
        handler = options.handler
        return () => {}
      },
    })
    cleanup.push(stopWeb)
    const pluginFiber = await harness.ctx.plugin(plugin)
    cleanup.push(() => pluginFiber.dispose())
  })

  afterEach(async () => {
    for (const dispose of cleanup.splice(0).reverse()) await dispose()
    for (const scope of scopes.splice(0).reverse()) await scope.dispose()
    await harness.close()
  })

  function liveAgent(id: string, cwd = '/fixture/workspace') {
    const agent = { id, session: { id, header: { cwd } } } as unknown as Agent
    const scope = createScope(harness.ctx, agent)
    Object.assign(agent, { ctx: scope.ctx })
    scopes.push(scope)
    const detach = agents.enter(agent, undefined)
    cleanup.push(detach)
    return { agent, scope, detach }
  }

  function installUdt(scope: Scope, modelInvocable = true) {
    return scope.ctx.get('skills')!.register({
      name: UDT_SKILL_NAME, description: 'Tutor fixture', source: 'runtime',
      content: UDT_FIXTURE_CONTENT, invocation: { modelInvocable, userInvocable: true },
    })
  }

  async function overview(sessionId?: string): Promise<boolean | null> {
    let body = ''
    const res = {
      statusCode: 200, setHeader() {}, end(chunk: string) { body = chunk },
    } as unknown as ServerResponse
    await handler({
      method: 'GET',
      url: `${API_PREFIX}/overview${sessionId === undefined ? '' : `?sessionId=${encodeURIComponent(sessionId)}`}`,
      headers: { host: '127.0.0.1:19387' },
    } as IncomingMessage, res)
    expect(res.statusCode).toBe(200)
    return (JSON.parse(body) as { teachingBrain: boolean | null }).teachingBrain
  }

  it('finds Agent-scoped UDT while the global catalog contains only Office', async () => {
    for (const name of ['office-docx', 'office-pptx', 'office-xlsx']) {
      harness.ctx.skills.register({ name, description: name, source: 'runtime', content: name })
    }
    const { agent, scope } = liveAgent('with-tutor')
    installUdt(scope)
    expect((await harness.ctx.skills.list()).map((skill) => skill.name)).toEqual([
      'office-docx', 'office-pptx', 'office-xlsx',
    ])
    expect((await detectUdtSkill(harness.ctx.skills)).catalogVisible).toBe(false)
    expect(await overview()).toBeNull()
    expect(await overview('unknown-session')).toBeNull()
    expect(await teachingBrainForSession(harness.ctx, agent.id)).toBe(true)
    expect(await overview(agent.id)).toBe(true)
    expect(harness.logs.some((line) => line.includes('no teaching brain'))).toBe(false)
  })

  it('follows session switching, provider registration/removal and Agent replacement', async () => {
    harness.ctx.skills.register({ name: 'office-docx', description: 'Office', source: 'runtime', content: '' })
    const first = liveAgent('first')
    const second = liveAgent('second')
    expect(await overview('first')).toBe(false)
    const removeUdt = installUdt(first.scope)
    expect(await overview('first')).toBe(true)
    expect(await overview('second')).toBe(false)
    expect(await overview('first')).toBe(true)
    await removeUdt()
    expect(await overview('first')).toBe(false)
    first.detach()
    expect(await overview('first')).toBeNull()
    const replacement = liveAgent('first')
    installUdt(replacement.scope)
    expect(await overview('first')).toBe(true)
    second.detach()
    expect(await overview('second')).toBeNull()
  })

  it('retries an empty catalog after delayed registration', async () => {
    const { scope } = liveAgent('later')
    expect(await overview('later')).toBeNull()
    installUdt(scope)
    expect(await overview('later')).toBe(true)
  })

  it('keeps failed provider discovery inconclusive and retries recovery', async () => {
    harness.ctx.skills.register({ name: 'office-docx', description: 'Office', source: 'runtime', content: '' })
    const { scope } = liveAgent('flaky')
    const removeProvider = scope.ctx.get('skills')!.registerProvider(() => ({
      name: 'unavailable-provider',
      list() { throw new Error('fixture discovery failure') },
      get: async () => undefined,
    }))
    expect(await overview('flaky')).toBeNull()
    await removeProvider()
    expect(await overview('flaky')).toBe(false)
    installUdt(scope)
    expect(await overview('flaky')).toBe(true)
  })

  it('keeps a listed UDT inconclusive while its body fails to load', async () => {
    const { scope } = liveAgent('unloadable')
    installUdt(scope)
    const skills = harness.ctx.skills
    const get = skills.get.bind(skills)
    skills.get = async () => { throw new Error('fixture load failure') }
    expect(await overview('unloadable')).toBeNull()
    skills.get = get
    expect(await overview('unloadable')).toBe(true)
  })

  it('passes the exact Agent scope and session cwd to snapshot and get', async () => {
    const { agent, scope } = liveAgent('workspace', '/fixture/specific-project')
    installUdt(scope)
    const skills = harness.ctx.skills
    const snapshot = skills.snapshot.bind(skills)
    const get = skills.get.bind(skills)
    const views: unknown[] = []
    skills.snapshot = (options) => { views.push(options); return snapshot(options) }
    skills.get = (name, options) => { views.push(options); return get(name, options) }
    expect(await overview('workspace')).toBe(true)
    expect(views).toEqual([
      { scope: agent, cwd: '/fixture/specific-project' },
      { scope: agent, cwd: '/fixture/specific-project' },
    ])
  })

  it('does not use a completed observation from an Agent replaced during discovery', async () => {
    harness.ctx.skills.register({ name: 'office-docx', description: 'Office', source: 'runtime', content: '' })
    const first = liveAgent('replaced')
    const skills = harness.ctx.skills
    const original = skills.snapshot.bind(skills)
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    skills.snapshot = async (options) => {
      const result = await original(options)
      entered()
      await waiting
      return result
    }
    const pending = overview('replaced')
    await started
    first.detach()
    const replacement = liveAgent('replaced')
    installUdt(replacement.scope)
    release()
    expect(await pending).toBeNull()
    skills.snapshot = original
    expect(await overview('replaced')).toBe(true)
  })

  it('reports a Skill disabled for model invocation as unavailable', async () => {
    const { scope } = liveAgent('disabled')
    installUdt(scope, false)
    expect(await overview('disabled')).toBe(false)
  })

  it('resolves optional services on each observation', async () => {
    const { agent, scope } = liveAgent('services')
    installUdt(scope)
    let liveAgents: AgentRegistry | undefined
    let liveSkills: typeof harness.ctx.skills | undefined
    const context = {
      reflect: { get: (name: string) => name === 'agents' ? liveAgents : liveSkills },
    } as unknown as typeof harness.ctx
    expect(await teachingBrainForSession(context, agent.id)).toBeNull()
    liveAgents = agents
    expect(await teachingBrainForSession(context, agent.id)).toBeNull()
    liveSkills = harness.ctx.skills
    expect(await teachingBrainForSession(context, agent.id)).toBe(true)
    liveSkills = undefined
    expect(await teachingBrainForSession(context, agent.id)).toBeNull()
    liveSkills = harness.ctx.skills
    expect(await teachingBrainForSession(context, agent.id)).toBe(true)
  })
})
