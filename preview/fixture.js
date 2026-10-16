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
  function lessonFor(nodeId, list) {
    const target = (list ?? nodes).find((entry) => entry.id === nodeId)
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
   * Scenario state, so the preview can show the states that are awkward to
   * reach on demand in a live profile.
   *
   * A scenario overrides only the part it is about. `?scenario=next` still
   * starts from a real lesson rather than from a hand-built impression of one,
   * because the Continue card and the handoff line are exactly the surfaces
   * that used to be sighted once, in a screenshot, and never again.
   */
  const SCENARIOS = {
    /** No goal at all: the first-use surface. */
    'first-use': { noCourse: true },
    /** Map and detail only. Nothing focused, nothing taught. */
    map: {},
    /** A focus the tutor has not answered: the progress line, and its retry. */
    handoff: {
      focusNodeId: 'ml:math:la',
      noLesson: true,
      handoff: {
        targetNodeId: 'ml:math:la',
        phase: 'stalled',
        label: 'Waiting on the tutor',
        elapsedMs: 94_000,
        attempts: 3,
        stages: { 'focus-recorded': 12, 'tutor-requested': 480, 'tutor-working': 93_500 },
        detail: 'No lesson has been written for this node yet.',
      },
    },
    /** A lesson, and a recommendation that moves. */
    next: {
      focusNodeId: 'ml:math:la',
      nextStep: {
        fromNodeId: 'ml:math:la',
        fromNodeTitle: 'Linear Algebra',
        targetNodeId: 'ml:math:calc',
        targetNodeTitle: 'Calculus',
        action: 'advance',
        reason:
          'Shape and multiplication are stable now; the gradient is the next thing that needs the derivative.',
        createdAt: now,
      },
    },
    /** A recommendation that keeps the learner where they are. */
    stay: {
      focusNodeId: 'ml:math:la',
      nextStep: {
        fromNodeId: 'ml:math:la',
        fromNodeTitle: 'Linear Algebra',
        targetNodeId: null,
        targetNodeTitle: null,
        action: 'more-practice',
        reason: 'The rule is stated correctly, but the transpose case has not been tried yet.',
        createdAt: now,
      },
    },
    /** The skill is missing, so nothing will be taught. */
    noskill: { teachingBrain: false },
    /** Long content inside a clipped DSH slot: scroll regression fixtures only. */
    scroll: { focusNodeId: 'ml:math:la', longContent: true },
    library: { noCourse: true, longLibrary: true },
    new: { noCourse: true, startingNew: true, longLibrary: true },
    /** Long everything: the layout at its least forgiving. */
    long: {
      longTitles: true,
      focusNodeId: 'ml:math:la',
      nextStep: {
        fromNodeId: 'ml:math:la',
        fromNodeTitle: 'Linear Algebra: vector and matrix shapes, and the intuition behind multiplication',
        targetNodeId: 'ml:math:calc',
        targetNodeTitle: 'Calculus and optimisation: derivatives, gradients and the direction of descent',
        action: 'advance-with-caution',
        reason:
          'You can verify shapes and catch your own errors, which is the part that gates linear regression. What is unverified is whether the derivative reads as a rate of change rather than as a rule to apply, and that is the next thing the gradient needs — so this is a move, but a cautious one.',
        createdAt: now,
      },
    },
  }

  window.FIXTURE_SCENARIOS = Object.keys(SCENARIOS)

  /**
   * A `PanelClient` backed by this fixture instead of HTTP.
   *
   * Stateful on purpose: `startFocus` records a focus and the lesson only
   * exists afterwards, so the preview exercises the same sequence the real
   * panel does — press Start learning, then the surface fills in.
   *
   * @param options.scenario - one of `SCENARIOS`. An unknown key falls back to
   *   the plain map, so a typo shows the default surface rather than a blank.
   */
  window.createFixtureClient = function createFixtureClient(options) {
    const scenario = SCENARIOS[(options && options.scenario) || 'map'] ?? {}
    let focus = null
    const lessons = new Map()

    /** Long-name variant: the two titles that decide whether a row wraps. */
    const baseNodes = scenario.longContent
      ? nodes.concat(Array.from({ length: 30 }, (_, i) => node(`scroll:${i}`, `Practice topic ${i + 1}`, 'part-of', 'unconfirmed', 'ml:goal')))
      : nodes
    const shownNodes = scenario.longTitles
      ? baseNodes.map((entry) =>
          entry.id === 'ml:math'
            ? { ...entry, title: 'Mathematical foundations for machine learning, from notation to matrix calculus' }
            : entry.id === 'ml:math:la'
              ? { ...entry, title: 'Linear algebra: shapes, the multiplication rule, and why order matters' }
              : entry,
        )
      : baseNodes

    const shownCourse =
      scenario.longTitles === true
        ? { ...course, title: 'Machine Learning, end to end, from the mathematics up' }
        : course

    const library = scenario.longLibrary
      ? Array.from({ length: 30 }, (_, i) => ({ ...course, id: `library:${i}`, title: `Learning project ${i + 1}`, confirmed: 0, total: 1 }))
      : []
    const shownLesson = (nodeId) => {
      const lesson = lessonFor(nodeId, shownNodes)
      if (lesson && scenario.longContent) {
        lesson.blocks.push(...Array.from({ length: 20 }, (_, i) => ({
          id: `scroll:${i}`, type: 'text',
          content: { md: `### Explanation ${i + 1}\n\nA long learning surface must remain readable as the tutor appends new blocks. Scroll through the whole lesson, including the last paragraph and the controls below it.` },
        })))
      }
      return lesson
    }

    if (scenario.focusNodeId !== undefined) {
      const target = shownNodes.find((entry) => entry.id === scenario.focusNodeId)
      focus = {
        courseId: course.id,
        nodeId: scenario.focusNodeId,
        nodeTitle: target ? target.title : scenario.focusNodeId,
        startedAt: now,
        status: 'active',
      }
      if (scenario.noLesson !== true) {
        lessons.set(scenario.focusNodeId, shownLesson(scenario.focusNodeId))
      }
    }

    return {
      fetchOverview: () =>
        Promise.resolve({
          ok: true,
          selection: scenario.startingNew ? 'new' : scenario.noCourse ? 'none' : 'project',
          library,
          course: scenario.noCourse === true ? null : shownCourse,
          nodes: scenario.noCourse === true ? [] : shownNodes,
          focus,
          nextStep: scenario.nextStep ?? null,
          handoff: scenario.handoff ?? null,
          teachingBrain: scenario.teachingBrain === undefined ? true : scenario.teachingBrain,
          lessonCount: lessons.size,
        }),

      fetchNode: (nodeId) => {
        const target = shownNodes.find((entry) => entry.id === nodeId)
        if (!target) return Promise.reject(new Error('no such node'))
        return Promise.resolve({
          ok: true,
          node: { ...target, evidence: scenario.longContent
            ? Array.from({ length: 24 }, (_, i) => ({ kind: 'practice', at: now, note: `Observation ${i + 1}: long evidence history remains readable inside this pane.` }))
            : evidence[nodeId] ?? [] },
          parent: shownNodes.find((entry) => entry.id === target.parentId) ?? null,
          children: shownNodes.filter((entry) => entry.parentId === nodeId),
          lessonExists: lessons.has(nodeId),
        })
      },

      fetchLesson: (nodeId) =>
        Promise.resolve({ ok: true, lesson: lessons.get(nodeId) ?? null }),

      startFocus: (nodeId, sessionId) => {
        const target = shownNodes.find((entry) => entry.id === nodeId)
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
        lessons.set(nodeId, shownLesson(nodeId))
        return Promise.resolve({ ok: true, focus, prompted: true, sessionId })
      },
    }
  }
})()
