/**
 * Browser-only PathClient fixture. Nothing is fetched, persisted to a profile,
 * or sent to a tutor. Share one instance across preview surfaces to retain saves.
 * A page reload intentionally creates a fresh fixture.
 */
;(function () {
  'use strict'
  const SCENARIOS = ['curriculum', 'path-draft', 'path-setup', 'path-assessment']
  const DEFAULT_COURSE = 'machine-learning'
  const DEFAULT_SESSION = 'preview-session'
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const refs = [{ nodeId: 'ml:python', evidenceIndex: 0 }, { nodeId: 'ml:math:la', evidenceIndex: 0 }, { nodeId: 'ml:math:calc', evidenceIndex: 0 }, { nodeId: 'ml:math:prob', evidenceIndex: 0 }]

  function proposal() {
    const modules = [
      { id: 'foundations', title: 'Foundations for working with data', overview: 'Connect familiar Python to the mathematical objects used by small machine-learning models. Read shapes, rates of change, and uncertainty before combining them in a training loop.', outcomes: ['Inspect a tabular dataset and describe the shape of each array.', 'Explain a prediction as a weighted combination and interpret a derivative.', 'Distinguish an observed sample from the population it represents.'], milestone: 'Given a small housing dataset, annotate array shapes, calculate a prediction, and explain which summary statistics may change with a new sample.' },
      { id: 'supervised', title: 'Build and evaluate supervised models', overview: 'Turn the foundations into an end-to-end supervised learning workflow. Compare a baseline with linear and logistic models, then evaluate on data kept separate from training.', outcomes: ['Fit a regression model and explain how its loss guides updates.', 'Create a train/validation/test workflow without data leakage.', 'Choose and interpret a classification threshold.'], milestone: 'Implement a compact training loop and diagnose an unfamiliar evaluation result using a held-out split.' },
      { id: 'reliable', title: 'Make a model useful and trustworthy', overview: 'Compare model families, select evaluation criteria, and control overfitting. Finish by presenting a reproducible experiment and the limits of its conclusions.', outcomes: ['Compare a linear baseline with a tree model using the same split.', 'Justify metrics, regularization, and a tuning budget.', 'Present evidence for a model decision and explain unresolved risks.'], milestone: 'Deliver a reproducible model comparison with an error analysis, a justified recommendation, and a fresh-data transfer check.' },
    ]
    const item = (id, moduleId, title, overview, outcomes, outline, topics, nodeIds, practice, assessment, min, max) => ({ id, moduleId, title, overview, outcomes, outline, topics, nodeIds, practice, assessment, minutes: { min, max } })
    const items = [
      item('python-data', 'foundations', 'Python arrays and a first dataset', 'Load a small table into NumPy arrays, separate features from targets, and inspect missing values before fitting a model. Use a simple baseline to make the prediction task concrete.', ['Create feature and target arrays with compatible shapes.', 'Explain what one row and one column represent.'], ['Read a small CSV and inspect its schema.', 'Separate features, target, and identifiers.', 'Write a mean-prediction baseline and inspect its errors.'], ['Python', 'NumPy', 'data inspection', 'baseline'], ['ml:python'], 'Clean a six-row housing table and write assertions for feature and target shapes. Identify a column that would leak the target.', 'Explain a fresh table schema and predict the output shape of a small indexing expression.', 30, 45),
      item('matrix-shapes', 'foundations', 'Vectors, matrices, and prediction shapes', 'Read a feature matrix as a collection of observations. Work out which dimensions must agree in a matrix-vector product, and connect each output to one predicted value.', ['Check whether a matrix-vector product is defined.', 'Explain how a dot product becomes a prediction for one observation.'], ['Annotate rows, columns, and vector lengths.', 'Compute one dot product by hand.', 'Compare Xw and Xᵀw and trace the output shapes.'], ['linear algebra', 'matrix shapes', 'dot product'], ['ml:math:la'], 'For a 4 × 3 feature matrix, calculate a prediction with three weights. Then repair an incompatible multiplication and explain the repair.', 'Use an unseen matrix shape to justify the required weight length and output length without running code.', 35, 50),
      item('rates-gradients', 'foundations', 'Derivatives as local rates of change', 'Start with a scalar prediction error and use small changes to interpret a derivative. Connect the sign of the derivative to the direction that reduces a simple squared loss.', ['Interpret the sign and units of a derivative.', 'Check a symbolic derivative with a finite difference.'], ['Compare a function value with its rate of change.', 'Differentiate a one-parameter squared error.', 'Verify the result with nearby values.'], ['calculus', 'derivatives', 'finite differences'], ['ml:math:calc'], 'Calculate the loss near two weights and compare the change with the derivative prediction. Sketch where a descent step moves.', 'Explain a new loss curve and identify when a step size could increase the loss.', 35, 55),
      item('sample-uncertainty', 'foundations', 'Samples, probability, and uncertainty', 'Distinguish uncertainty in individual outcomes from variation across samples. Read means, variances, and conditional rates with an explicit denominator.', ['Compute and interpret a sample mean and variance.', 'Explain why a conditional rate needs its reference group.'], ['Compare a sample with its population.', 'Calculate summaries and inspect outliers.', 'Read conditional probabilities from a two-way table.'], ['probability', 'sampling', 'mean', 'variance'], ['ml:math:prob'], 'Compare two samples of delivery times and explain why their averages differ. Calculate a conditional error rate for each group.', 'Interpret an unfamiliar contingency table and describe one uncertainty a point estimate hides.', 30, 50),
      item('linear-regression', 'supervised', 'Linear regression and squared loss', 'Build a linear predictor from a feature matrix, weights, and bias. Compare candidate parameters using mean squared error and interpret coefficients in the original measurement units.', ['Compute predictions and mean squared error.', 'Interpret a coefficient while holding other features fixed.'], ['Write the prediction equation and check its shapes.', 'Compare residuals with squared loss.', 'Inspect the effect of feature units and a bias term.'], ['regression', 'residuals', 'mean squared error'], ['ml:math:la', 'ml:python'], 'Compute two competing models on a tiny table, compare their losses, and explain one large residual.', 'Given fresh feature values, calculate a prediction and critique a coefficient interpretation.', 40, 60),
      item('gradient-descent', 'supervised', 'Train a model with gradient descent', 'Combine prediction shapes and derivatives in a short training loop. Follow the loss over updates and diagnose a learning rate that is too small or too large.', ['Implement one gradient update with compatible shapes.', 'Use a loss trace to diagnose unstable training.'], ['Derive the gradient for one parameter.', 'Vectorize the update and verify shapes.', 'Compare learning rates on the same starting parameters.'], ['optimization', 'gradient descent', 'learning rate'], ['ml:math:calc', 'ml:math:la', 'ml:python'], 'Implement a ten-step training loop, log the loss, and explain a deliberately divergent run before changing the learning rate.', 'Repair an unfamiliar update equation and justify both its sign and dimensions.', 45, 65),
      item('honest-splits', 'supervised', 'Train, validate, and avoid leakage', 'Separate model fitting, choice, and final evaluation. Trace where preprocessing learns from data and place it inside the correct split to keep the estimate meaningful.', ['Assign data to training, validation, and final testing roles.', 'Identify target and preprocessing leakage.'], ['Define the future prediction setting.', 'Create random, grouped, or temporal splits as appropriate.', 'Fit preprocessing only on training data.'], ['validation', 'test split', 'data leakage'], ['ml:python', 'ml:math:prob'], 'Audit a notebook containing scaling-before-splitting and a future-information feature. Rewrite the workflow and explain the expected change in evaluation.', 'Choose a split for a fresh time-series or grouped-data scenario and defend the choice.', 35, 55),
      item('logistic-classifier', 'supervised', 'Classification scores and thresholds', 'Convert a linear score into a binary prediction with logistic regression. Compare decision thresholds and connect their errors to the purpose of the model.', ['Distinguish a probability score from a class decision.', 'Explain how a threshold changes false positives and false negatives.'], ['Read the sigmoid as a mapping from score to probability.', 'Compute log loss on simple examples.', 'Compare thresholds using a confusion matrix.'], ['classification', 'logistic regression', 'threshold'], ['ml:math:prob', 'ml:math:calc'], 'Use six predicted probabilities to build confusion matrices at two thresholds. Recommend one for a stated cost of missed cases.', 'Interpret a new score distribution and justify a threshold without confusing accuracy with calibrated probability.', 40, 60),
      item('tree-baseline', 'reliable', 'Compare a tree with a linear baseline', 'Train a shallow decision tree on the same data split as the linear model. Explain how a split partitions feature space and how depth changes fit and complexity.', ['Read a small decision tree as a sequence of rules.', 'Compare models using a shared evaluation protocol.'], ['Trace predictions through a shallow tree.', 'Compare linear and piecewise decision boundaries.', 'Measure training and validation errors as depth grows.'], ['decision trees', 'baseline comparison', 'complexity'], ['ml:python'], 'Fit a shallow and a deep tree, compare their validation results with the linear baseline, and explain one disagreement.', 'Trace an unseen observation through a tree and identify evidence of overfitting in a results table.', 35, 55),
      item('metrics-errors', 'reliable', 'Choose metrics and inspect model errors', 'Move from one aggregate score to an error analysis tied to the intended use. Compare metrics, inspect subgroups, and distinguish observed disparities from unsupported causal claims.', ['Select a metric aligned with the cost of errors.', 'Identify an error pattern that an aggregate score hides.'], ['Compare regression and classification metric meanings.', 'Inspect residuals, false positives, and false negatives.', 'Summarize subgroup results with sample sizes and uncertainty.'], ['metrics', 'error analysis', 'subgroups', 'uncertainty'], ['ml:math:prob'], 'Build an error table for two models, inspect the worst cases, and report a subgroup comparison with its denominators.', 'Recommend a model for a fresh use case using an explicit metric, tradeoff, and limitation.', 40, 60),
      item('regularize-tune', 'reliable', 'Regularization and a bounded tuning plan', 'Control model flexibility with regularization and tune a small set of choices on validation data. Preserve the final test set for a single honest evaluation.', ['Explain the effect of regularization on coefficients and fit.', 'Design a tuning plan that respects the data and time budget.'], ['Compare training and validation error curves.', 'Inspect a regularized objective.', 'Choose a small search space and record every comparison.'], ['regularization', 'hyperparameters', 'cross validation'], ['ml:math:calc', 'ml:python'], 'Compare three penalty strengths with a fixed split, record a selection rule, and predict what could go wrong if the test set is reused.', 'Critique a new tuning report and propose the smallest change needed for a credible estimate.', 40, 60),
      item('capstone-audit', 'reliable', 'Capstone: explain and audit your model', 'Bring the workflow together in a reproducible model comparison. Explain the decision to a reader who did not build it and test whether the reasoning transfers to a fresh dataset.', ['Reproduce a model comparison from a clean starting point.', 'Defend a recommendation using results, error analysis, and limitations.'], ['State the task, data source, split, and baseline.', 'Run a bounded comparison and inspect errors.', 'Present the recommendation and answer a fresh-data transfer check.'], ['capstone', 'reproducibility', 'model audit', 'transfer'], ['ml:goal', 'ml:python', 'ml:math:prob'], 'Deliver a short notebook and one-page model card with seed, split, metrics, representative mistakes, and an explicit limit on use.', 'Reproduce the result, defend one model choice, and adapt the evaluation plan to a new dataset with shifted sampling.', 55, 80),
    ]
    const required = [['python-data', 'matrix-shapes'], ['python-data', 'sample-uncertainty'], ['matrix-shapes', 'linear-regression'], ['linear-regression', 'gradient-descent'], ['rates-gradients', 'gradient-descent'], ['python-data', 'honest-splits'], ['sample-uncertainty', 'honest-splits'], ['gradient-descent', 'logistic-classifier'], ['sample-uncertainty', 'logistic-classifier'], ['honest-splits', 'tree-baseline'], ['honest-splits', 'metrics-errors'], ['logistic-classifier', 'metrics-errors'], ['gradient-descent', 'regularize-tune'], ['honest-splits', 'regularize-tune'], ['tree-baseline', 'capstone-audit'], ['metrics-errors', 'capstone-audit'], ['regularize-tune', 'capstone-audit']]
    const optional = [['matrix-shapes', 'rates-gradients'], ['sample-uncertainty', 'linear-regression'], ['linear-regression', 'tree-baseline'], ['tree-baseline', 'regularize-tune']]
    return { title: 'Machine learning: from arrays to an honest model comparison', summary: 'A complete, browsable route from Python and mathematical foundations to a reproducible supervised-learning project. Each lesson has an Overview now; the tutor writes teaching units and checks when you explicitly begin.', modules, items, edges: [...required.map(([from, to]) => ({ from, to, kind: 'required' })), ...optional.map(([from, to]) => ({ from, to, kind: 'optional' }))], assumptions: ['Existing Python and mathematics observations are diagnostic notes, not proof of mastery; use a short check before moving quickly.', 'Use small tabular datasets and NumPy first; deep learning and deployment are outside this route.', 'The eight-week target and three hours each week leave room for practice and revisions; estimates remain approximate.'], changeReason: 'Preview-only route based on the saved project goal and the existing evidence references. Mathematical foundations appear before the training loop; honest evaluation is a required prerequisite for the capstone.' }
  }

  const teaching = {
    'python-data': ['A feature matrix X keeps one observation in each row and one measured feature in each column. For six houses described by area and room count, X has shape (6, 2). A target vector y stores one sale price per house, so its shape is (6,). An identifier can help trace a row, but it is usually not a meaningful measurement to feed into the model.', 'A table has eight patients and three measured features. What are the shapes of X and y, and why should the patient identifier be kept separate?'],
    'matrix-shapes': ['Let X have shape (4, 3): four observations, each with three features. A weight vector w of length 3 gives one weight to each feature. Each row of X forms a dot product with w, so Xw has length 4: one prediction per observation. For a row [2, 1, 3] and weights [0.5, −1, 2], the prediction is 2×0.5 + 1×(−1) + 3×2 = 6. The matching inner dimension counts the terms in each dot product.', 'X has shape (5, 2). What shape must w have for Xw to produce one prediction per observation? What is the output shape, and why would a length-5 weight vector fail?'],
    'rates-gradients': ['For a single prediction with target 3, let L(w) = (w − 3)². Its derivative is 2(w − 3). At w = 1, the derivative is −4: increasing w a little decreases the loss. A descent update subtracts the derivative, so a step size of 0.1 gives w_new = 1 − 0.1×(−4) = 1.4.', 'At w = 4, which direction should a small descent step move, and what in the derivative tells you that?'],
    'sample-uncertainty': ['A sample average summarizes the observations you collected; it is not the population value itself. If a group has 4 errors among 20 predictions, its observed error rate is 4/20 = 20%. Comparing that with another group requires the denominator as well as the number of errors.', 'Group A has 4 errors in 20 predictions; group B has 6 in 60. Which observed rate is higher, and what uncertainty remains?'],
    'linear-regression': ['A linear prediction adds weighted features and a bias. With area x = 2, weight w = 3, and bias b = 1, the prediction is 7. If the target is 5, the residual is 2 and its squared error is 4. Mean squared error averages these squared errors over observations.', 'Predictions are [3, 5] and targets are [2, 7]. What is the mean squared error? Show each residual.'],
    'gradient-descent': ['Gradient descent updates parameters in the direction opposite the local increase in loss: w_new = w − ηg. If w = 2, gradient g = 3, and learning rate η = 0.1, the next weight is 1.7. The minus sign matters; the loss trace checks whether the chosen step is useful in practice.', 'A run produces losses 4, 8, 19, 51. What would you inspect first, and why does a correct gradient not guarantee every step reduces the loss?'],
    'honest-splits': ['Fit preprocessing on training data, then reuse its learned parameters on validation and test data. Computing a scaling mean from the full dataset lets evaluation observations influence the pipeline before evaluation. A held-out split should mimic the observations the model will face later.', 'You predict next month’s demand. Why can a random row split look better than a chronological split, and where should a scaler learn its mean?'],
    'logistic-classifier': ['A classifier score and a decision threshold play different roles. A probability estimate of 0.4 becomes a negative decision at threshold 0.5 and a positive decision at threshold 0.3. Lowering the threshold can catch more positives while also increasing false alarms.', 'For scores [0.2, 0.4, 0.8] and labels [0, 1, 1], compare false negatives at thresholds 0.5 and 0.3.'],
    'tree-baseline': ['A decision tree partitions feature space with a sequence of rules. A split such as area < 80 sends an observation down one of two branches. Increasing depth can reduce training error, but validation error may rise if the rules fit quirks of the training sample.', 'A deeper tree improves training error while worsening validation error. What does this suggest, and what comparison would you run next?'],
    'metrics-errors': ['An aggregate metric can hide which mistakes the model makes. A 95% accurate classifier may miss every positive case when positives are rare. Inspect false negatives and false positives with their reference groups, then relate those errors to the intended use.', 'Only 5 of 100 cases are positive. A model predicts every case negative. What is its accuracy, and why might it fail the task?'],
    'regularize-tune': ['Regularization adds a penalty for model complexity to the training objective. A stronger penalty can shrink weights and reduce sensitivity to a noisy sample, while also increasing bias. Choose its strength on validation data using a recorded rule; keep the final test result for the end.', 'Why does selecting the best of twenty models on the test set make the reported test result less credible?'],
    'capstone-audit': ['A reproducible comparison names the prediction task, source data, split rule, baseline, metric, and selection rule. Its conclusion should connect the observed result to a recommendation and name a limitation. Fresh data can change the error pattern even when the notebook reproduces exactly.', 'Your chosen model wins on the original test set but loses on a newly sampled group. What would you investigate before recommending it for that group?'],
  }

  window.createPathFixture = function createPathFixture(options) {
    const scenario = SCENARIOS.includes(options && options.scenario) ? options.scenario : 'curriculum'
    const createdAt = new Date().toISOString()
    const targetDate = new Date(Date.parse(createdAt) + 56 * 86400000).toISOString().slice(0, 10)
    const courses = new Map()
    let sequence = 0
    let clock = Date.parse(createdAt)
    const tick = () => new Date(clock = Math.max(Date.now(), clock + 1)).toISOString()
    const error = (message, code, status = 400) => Object.assign(new Error(message), { name: 'PathFixtureError', code, status })
    const brief = () => ({ purpose: 'Build and explain a small supervised-learning model for a practical data project.', outcomes: ['Implement a reproducible regression and classification workflow in Python.', 'Explain model errors using shapes, gradients, probability, and held-out evaluation.', 'Compare models and defend a recommendation with explicit limitations.'], background: 'I can write short Python scripts. Matrix multiplication, derivatives, and conditional probability are familiar terms, but I need short checks before relying on them.', timeZone: 'America/New_York', targetDate, durationWeeks: null, deadline: 'flexible', weeklyMinutes: 180, sessionMinutes: 35, preferences: 'Use English, small tabular datasets, worked numerical examples, and a check after each teaching unit. Prefer NumPy before higher-level libraries.' })
    const emptyRun = (courseId, sessionId) => ({ courseId, sessionId, revision: 0, activeAttemptId: null, attempts: [], updatedAt: createdAt })
    const snapshot = (courseId, entry, attemptId, at) => {
      const [md, prompt] = teaching[entry.id]
      return { id: `${attemptId}:unit-1`, writtenAt: at, lesson: { id: `${attemptId}:lesson`, courseId, nodeId: entry.nodeIds[0], title: entry.title, origin: 'tutor', createdAt: at, updatedAt: at, blocks: [{ id: 'preview-explanation', type: 'text', content: { md: `*Preview teaching snapshot — supplied by the fixture; no tutor was contacted.*\n\n${md}` } }, { id: 'preview-check', type: 'check', content: { prompt, expect: 'reasoning', hint: 'Explain the reasoning in the conversation. This preview does not grade or record an answer.' } }] } }
    }
    const makeAttempt = (courseId, entry, version, operationId, at) => {
      const id = `preview-attempt-${++sequence}`
      return { id, operationId, operations: [operationId], dispatchId: null, version, itemId: entry.id, status: 'working', nodeId: entry.nodeIds[0], startedAt: at, updatedAt: at, prompted: true, promptReason: null, outcome: null, evidence: [], units: [snapshot(courseId, entry, id, at)] }
    }
    function stateFor(courseId) {
      if (typeof courseId !== 'string' || !courseId.trim()) throw error('A course ID is required.', 'missing-course-id')
      if (!courses.has(courseId)) {
        const path = { courseId, revision: 0, briefRevision: 0, assessmentRevision: 0, brief: null, assessment: null, curricula: [], acceptedVersion: null, requests: [], updatedAt: createdAt }
        if (scenario !== 'path-setup') { path.brief = brief(); path.briefRevision = 1; path.revision = 1 }
        if (scenario === 'curriculum' || scenario === 'path-draft') {
          path.assessment = { status: 'ready', summary: 'Preview assessment references the existing diagnostic observations. Python experience is self-reported; matrix shapes, derivatives, and conditional probability remain unverified, so the route begins with short foundation checks.', strengths: ['Some Python scripting experience is reported in the project background.'], gaps: ['Mathematical foundations are recorded as a blocker, pending focused checks.'], uncertainties: ['Array fluency and matrix multiplication have not been checked.', 'Derivative meaning and conditional probability remain unverified.'], evidence: clone(refs), briefRevision: 1, sessionId: DEFAULT_SESSION, updatedAt: createdAt }
          path.assessmentRevision = 1
          path.curricula = [{ ...proposal(), version: 1, briefRevision: 1, assessmentRevision: 1, createdAt, acceptedAt: scenario === 'curriculum' ? createdAt : null }]
          path.acceptedVersion = scenario === 'curriculum' ? 1 : null
          path.revision = scenario === 'curriculum' ? 4 : 3
        }
        const runs = new Map()
        if (scenario === 'curriculum') {
          const attempt = makeAttempt(courseId, path.curricula[0].items[1], 1, 'preview-seeded-start', createdAt)
          runs.set(DEFAULT_SESSION, { ...emptyRun(courseId, DEFAULT_SESSION), revision: 1, activeAttemptId: attempt.id, attempts: [attempt] })
        }
        courses.set(courseId, { path, runs })
      }
      return courses.get(courseId)
    }
    const runFor = (state, sessionId) => {
      if (!state.runs.has(sessionId)) state.runs.set(sessionId, emptyRun(state.path.courseId, sessionId))
      return state.runs.get(sessionId)
    }
    const view = (courseId, sessionId, extra) => {
      const state = stateFor(courseId)
      return clone({ ok: true, path: state.path, run: sessionId ? runFor(state, sessionId) : null, now: new Date(clock).toISOString(), ...extra })
    }
    const requireWrite = (params) => {
      if (!params || typeof params.sessionId !== 'string' || !params.sessionId.trim()) throw error('Open a preview conversation before changing a route.', 'missing-session-id')
      const state = stateFor(params.courseId)
      if (params.expectedRevision !== state.path.revision) throw error('This preview route changed. Refresh its current revision.', 'revision-conflict', 409)
      return state
    }
    const changed = (state, at) => { state.path.revision += 1; state.path.updatedAt = at }
    const ready = (path) => !!path.brief?.purpose.trim() && path.brief.outcomes.length > 0
    const currentAssessment = (path) => path.assessment?.briefRevision === path.briefRevision && ['ready', 'skipped'].includes(path.assessment.status)
    const validBrief = (value) => {
      if (!value || typeof value.purpose !== 'string' || !Array.isArray(value.outcomes) || value.outcomes.some((entry) => typeof entry !== 'string' || !entry.trim())) throw error('Use a goal brief with a purpose and a list of outcomes.', 'invalid-brief')
      try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format() } catch { throw error('Use a valid IANA time zone.', 'invalid-time-zone') }
      if (!['none', 'flexible', 'fixed'].includes(value.deadline) || value.targetDate !== null && value.durationWeeks !== null || value.deadline === 'none' && (value.targetDate !== null || value.durationWeeks !== null) || value.deadline !== 'none' && value.targetDate === null && value.durationWeeks === null) throw error('Choose a valid target date, duration, or no deadline.', 'invalid-deadline')
      if (value.targetDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(value.targetDate) || !Number.isFinite(Date.parse(`${value.targetDate}T12:00:00Z`)) || new Date(`${value.targetDate}T12:00:00Z`).toISOString().slice(0, 10) !== value.targetDate)) throw error('Choose a valid target date.', 'invalid-date')
      for (const [key, min, max] of [['durationWeeks', 1, 260], ['weeklyMinutes', 15, 10080], ['sessionMinutes', 5, 480]]) if (value[key] !== null && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) throw error(`Invalid ${key}.`, 'invalid-budget')
    }
    // Seed eagerly so unrelated reads cannot change the default scenario IDs.
    stateFor(DEFAULT_COURSE)
    return {
      async get(courseId, sessionId) { return view(courseId, sessionId) },
      async saveBrief(params) {
        const state = requireWrite(params)
        validBrief(params.brief)
        state.path.brief = clone(params.brief)
        state.path.briefRevision += 1
        changed(state, tick())
        return view(params.courseId, params.sessionId)
      },
      async request(params) {
        const existing = stateFor(params.courseId).path.requests.find((entry) => entry.id === params.operationId)
        if (existing) {
          if (existing.sessionId !== params.sessionId || existing.kind !== params.kind) throw error('This operation ID belongs to another request.', 'operation-id-conflict')
          return view(params.courseId, params.sessionId, { prompted: existing.prompted })
        }
        const state = requireWrite(params)
        if (!ready(state.path)) throw error('Save a purpose and an observable outcome first.', 'missing-goal-outcome')
        if (!['diagnosis', 'plan'].includes(params.kind) || !params.operationId) throw error('Use a diagnosis or plan operation with an ID.', 'invalid-request')
        if (params.kind === 'plan' && !currentAssessment(state.path)) throw error('Complete or explicitly skip the current assessment first.', 'diagnosis-first')
        const at = tick()
        state.path.requests.push({ id: params.operationId, sessionId: params.sessionId, kind: params.kind, briefRevision: state.path.briefRevision, createdAt: at, prompted: true, reason: null })
        if (params.kind === 'diagnosis') {
          state.path.assessment = { status: 'in-progress', summary: 'Preview simulation: diagnosis is in progress. No tutor was contacted and no learner answers were evaluated. Use the explicit skip action to continue exploring the route-proposal flow.', strengths: [], gaps: [], uncertainties: ['This browser fixture cannot verify learner ability.'], evidence: [], briefRevision: state.path.briefRevision, sessionId: params.sessionId, updatedAt: at }
          state.path.assessmentRevision += 1
        } else {
          state.path.curricula.push({ ...proposal(), version: (state.path.curricula.at(-1)?.version ?? 0) + 1, briefRevision: state.path.briefRevision, assessmentRevision: state.path.assessmentRevision, createdAt: at, acceptedAt: null })
        }
        changed(state, at)
        return view(params.courseId, params.sessionId, { prompted: true })
      },
      async skipAssessment(params) {
        const state = requireWrite(params)
        if (!ready(state.path)) throw error('Save a purpose and an observable outcome first.', 'missing-goal-outcome')
        const at = tick()
        state.path.assessment = { status: 'skipped', summary: 'The learner explicitly skipped the initial assessment in this preview. Background notes remain self-reports; foundation checks are included in the proposed route.', strengths: [], gaps: [], uncertainties: ['Python, linear algebra, calculus, and probability remain unverified.'], evidence: [], briefRevision: state.path.briefRevision, sessionId: params.sessionId, updatedAt: at }
        state.path.assessmentRevision += 1
        changed(state, at)
        return view(params.courseId, params.sessionId)
      },
      async accept(params) {
        const state = requireWrite(params)
        const route = state.path.curricula.find((entry) => entry.version === params.version)
        if (!route || route.briefRevision !== state.path.briefRevision || route.assessmentRevision !== state.path.assessmentRevision) throw error('Request a route for the current goal and assessment.', 'stale-curriculum')
        const at = tick()
        route.acceptedAt = route.acceptedAt || at
        state.path.acceptedVersion = route.version
        changed(state, at)
        return view(params.courseId, params.sessionId)
      },
      async start(params) {
        const before = stateFor(params.courseId)
        const replay = before.runs.get(params.sessionId)?.attempts.find((entry) => entry.operations.includes(params.operationId))
        if (replay) {
          if (replay.itemId !== params.itemId || replay.version !== params.version) throw error('This operation ID belongs to another lesson.', 'operation-id-conflict')
          return view(params.courseId, params.sessionId, { prompted: true })
        }
        const state = requireWrite(params)
        if (!params.operationId) throw error('A start operation ID is required.', 'invalid-operation')
        const plan = state.path.curricula.find((entry) => entry.version === params.version)
        const entry = plan?.items.find((candidate) => candidate.id === params.itemId)
        if (!entry) throw error('Choose a lesson in this route.', 'no-such-course-item')
        const run = runFor(state, params.sessionId)
        const current = run.attempts.find((attempt) => attempt.id === run.activeAttemptId)
        const continuing = current && current.version === params.version && current.itemId === params.itemId && ['working', 'requested'].includes(current.status) && !params.review
        const at = tick()
        if (continuing) { current.operations.push(params.operationId); current.updatedAt = at }
        else {
          if (state.path.acceptedVersion !== params.version || !plan.acceptedAt) throw error('Accept this route before starting a lesson.', 'accept-the-current-route-before-starting')
          if (!ready(state.path) || plan.briefRevision !== state.path.briefRevision || plan.assessmentRevision !== state.path.assessmentRevision) throw error('Request a route for the updated goal and assessment.', 'stale-curriculum')
          const attempt = makeAttempt(params.courseId, entry, params.version, params.operationId, at)
          for (const old of run.attempts) if (['working', 'requested'].includes(old.status)) { old.status = 'interrupted'; old.updatedAt = at }
          run.attempts.push(attempt)
          run.activeAttemptId = attempt.id
        }
        run.revision += 1
        run.updatedAt = at
        changed(state, at)
        return view(params.courseId, params.sessionId, { prompted: true })
      },
    }
  }
  window.PATH_FIXTURE_SCENARIOS = SCENARIOS.slice()
})()
