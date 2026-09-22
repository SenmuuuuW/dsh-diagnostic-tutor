/**
 * Preview fixture.
 *
 * Models a learner who said "I want to learn machine learning" with some Python
 * and shaky maths — the same shape a real session produced. The map is exactly:
 *
 *   Machine Learning            [goal, unconfirmed]
 *   ├─ Math Foundations         [prerequisite, blocked]
 *   │  ├─ Linear Algebra        [part-of, unconfirmed]
 *   │  ├─ Calculus              [part-of, unconfirmed]
 *   │  └─ Probability           [part-of, unconfirmed]
 *   └─ Python                   [prerequisite, unconfirmed]
 *
 * This exists so the UI can be iterated on without starting an agent: the panel
 * takes its API as a prop, and here that prop is backed by this file.
 */
;(function () {
  const now = '2026-01-01T00:00:00.000Z'

  const course = {
    id: 'machine-learning',
    title: 'Machine Learning',
    goal: 'Learn ML from weak math foundations',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  const node = (id, title, relation, state, parentId, evidenceCount) => ({
    id,
    title,
    relation,
    state,
    parentId: parentId ?? null,
    evidenceCount: evidenceCount ?? 0,
    updatedAt: now,
  })

  const nodes = [
    node('ml:goal', 'Machine Learning', 'goal', 'unconfirmed', null, 1),
    node('ml:math', 'Math Foundations', 'prerequisite', 'blocked', 'ml:goal', 1),
    node('ml:math:la', 'Linear Algebra', 'part-of', 'unconfirmed', 'ml:math', 1),
    node('ml:math:calc', 'Calculus', 'part-of', 'unconfirmed', 'ml:math', 1),
    node('ml:math:prob', 'Probability', 'part-of', 'unconfirmed', 'ml:math', 1),
    node('ml:python', 'Python', 'prerequisite', 'unconfirmed', 'ml:goal', 1),
  ]

  const evidence = {
    'ml:goal': [
      {
        kind: 'goal-stated',
        at: now,
        note: 'I want to learn machine learning; I know a little Python and my maths is shaky.',
      },
    ],
    'ml:math': [
      {
        kind: 'diagnosis',
        at: now,
        readiness: 'step-down',
        note: 'Self-reported shaky maths. Not yet pinned to linear algebra, calculus or probability — and nothing has been attempted, so this stays a blocker rather than a weakness.',
      },
    ],
    'ml:math:la': [
      {
        kind: 'diagnosis',
        at: now,
        readiness: 'diagnose-again',
        note: 'Undiagnosed: unclear whether matrix shape and multiplication are stable. This gates both linear regression and gradient computation.',
      },
    ],
    'ml:math:calc': [
      {
        kind: 'diagnosis',
        at: now,
        readiness: 'diagnose-again',
        note: 'Undiagnosed: unclear whether derivatives and gradients are meaningful yet.',
      },
    ],
    'ml:math:prob': [
      {
        kind: 'diagnosis',
        at: now,
        readiness: 'diagnose-again',
        note: 'Undiagnosed: means and variance have probably been seen; conditional probability and train/test splits have not been verified.',
      },
    ],
    'ml:python': [
      {
        kind: 'diagnosis',
        at: now,
        readiness: 'diagnose-again',
        note: 'Self-reported "a little Python": scope unverified, and NumPy arrays have not been checked.',
      },
    ],
  }

  /** The prototype lesson the host would build for a node. */
  function lessonFor(nodeId) {
    const target = nodes.find((entry) => entry.id === nodeId)
    if (!target) return null
    const trail = evidence[nodeId] ?? []
    return {
      id: `${nodeId}:lesson`,
      courseId: course.id,
      nodeId,
      title: target.title,
      origin: 'tutor',
      createdAt: now,
      updatedAt: now,
      blocks: [
        {
          id: 'where',
          type: 'text',
          content: {
            md:
              `**${target.title}** is on your map for *${course.title}* in the state \`${target.state}\`, ` +
              `with ${trail.length} recorded observation${trail.length === 1 ? '' : 's'}.\n\n` +
              (target.relation === 'goal'
                ? 'This is the goal itself — the frame the rest of the map hangs from.'
                : target.relation === 'prerequisite'
                  ? 'This was recorded as a **prerequisite**: something diagnosed as blocking the node above it.'
                  : 'This is a **part of** the node above it — a component the diagnosis separated out.'),
          },
        },
        {
          id: 'evidence',
          type: 'example',
          content: {
            title: 'What the runtime has actually recorded',
            steps: trail.length
              ? trail.map((entry) => `${entry.kind}${entry.readiness ? ' — readiness: ' + entry.readiness : ''}: ${entry.note ?? ''}`)
              : ['No observation has been recorded against this node yet.'],
            takeaway:
              'A node only moves off `unconfirmed` because something was observed — never because it was asserted.',
          },
        },
        {
          id: 'map',
          type: 'diagram',
          content: {
            format: 'ascii',
            spec: [
              'Machine Learning [unconfirmed]',
              '├─ Math Foundations [blocked]',
              '│  ├─ Linear Algebra [unconfirmed]',
              '│  ├─ Calculus [unconfirmed]',
              '│  └─ Probability [unconfirmed]',
              `└─ Python [unconfirmed]${target.id === 'ml:python' ? '   ◀ this node' : ''}`,
            ].join('\n'),
            caption: `Where ${target.title} sits in the diagnosis map.`,
          },
        },
        {
          id: 'check',
          type: 'check',
          content: {
            prompt:
              `Before any teaching starts: in your own words, what do you already know about **${target.title}**, ` +
              'and where does it stop being clear?',
            expect: 'reasoning',
            hint: 'A rough answer is more useful than a polished one — the gaps are the point.',
          },
        },
      ],
    }
  }

  /**
   * A `PanelClient` backed by this fixture instead of HTTP.
   *
   * Stateful on purpose: `startFocus` records a focus and the lesson only
   * exists afterwards, so the preview exercises the same sequence the real
   * panel does — press Start learning, then the surface fills in.
   */
  window.createFixtureClient = function createFixtureClient() {
    let focus = null
    const lessons = new Map()

    return {
      fetchOverview: () => Promise.resolve({ ok: true, course, nodes, focus, lessonCount: lessons.size }),

      fetchNode: (nodeId) => {
        const target = nodes.find((entry) => entry.id === nodeId)
        if (!target) return Promise.reject(new Error('no such node'))
        return Promise.resolve({
          ok: true,
          node: { ...target, evidence: evidence[nodeId] ?? [] },
          parent: nodes.find((entry) => entry.id === target.parentId) ?? null,
          children: nodes.filter((entry) => entry.parentId === nodeId),
          lessonExists: lessons.has(nodeId),
        })
      },

      fetchLesson: (nodeId) =>
        Promise.resolve({ ok: true, lesson: lessons.get(nodeId) ?? null }),

      startFocus: (nodeId, sessionId) => {
        const target = nodes.find((entry) => entry.id === nodeId)
        if (!target) return Promise.reject(new Error('no such node'))
        focus = {
          courseId: course.id,
          nodeId,
          nodeTitle: target.title,
          startedAt: now,
          status: 'active',
        }
        // The tutor "writes" its unit: the preview has no agent, so the fixture
        // supplies what udt_lesson_update would have stored.
        lessons.set(nodeId, lessonFor(nodeId))
        return Promise.resolve({ ok: true, focus, prompted: true, sessionId })
      },
    }
  }
})()
