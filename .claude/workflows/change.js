export const meta = {
  name: 'change',
  description: 'Plan, build in parallel, verify and document a change to the project, reading only the files each step needs',
  whenToUse: 'A change that touches more than one area of the project. Pass args: { task: "what to change", agents?: { test, review } } (names of subagents to use for verification). Small one-file edits do not need it. Project-specific rules and checks come from CLAUDE.md and .claude/rules/, not from this file.',
  phases: [
    { title: 'Plan', detail: 'one agent maps the task to files using the repo map and Graphify' },
    { title: 'Build', detail: 'one agent per independent work item, disjoint files' },
    { title: 'Verify', detail: 'the project checks and an adversarial diff review in parallel' },
    { title: 'Docs', detail: 'update log and decisions' },
  ],
}

const task = typeof args === 'string' ? args : args && args.task
if (!task) throw new Error('Pass args: { task: "what to change" }')

// Optional project subagents for the Verify phase: args.agents = { test: '<name>', review: '<name>' }.
const AGENTS = (args && args.agents) || {}

const READ_RULE =
  'Read in layers (CLAUDE.md): start from the repo map (.claude/tools/tree.sh), use .claude/tools/graph.sh for questions, ' +
  'and open only files that are named; use Grep or Read with offset/limit instead of whole files. Follow the rules in CLAUDE.md and .claude/rules/.'

const PLAN = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          goal: { type: 'string', description: 'What this item changes, in one or two sentences' },
          edit: { type: 'array', items: { type: 'string' }, description: 'Repo-relative files this item may edit' },
          readFirst: { type: 'array', items: { type: 'string' }, description: 'Files to read for context, kept to the minimum' },
        },
        required: ['id', 'goal', 'edit'],
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' }, description: 'Facts only the owner can supply' },
  },
  required: ['items'],
}

const BUILT = {
  type: 'object',
  properties: { changed: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } },
  required: ['changed'],
}

const CHECK = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'problems'],
}

phase('Plan')
const plan = await agent(
  `Task: ${task}\n\nBreak this into the smallest set of work items. Each item lists the files it may edit. ` +
    `Items must edit DISJOINT files so they can run in parallel; if two pieces need the same file, make them one item. ` +
    `A one-file change is one item. List only what is needed.\n\n${READ_RULE}`,
  { phase: 'Plan', label: 'plan', schema: PLAN }
)
if (!plan || !plan.items || !plan.items.length) throw new Error('Planner returned no work items')

// Merge items that share a file so parallel agents never edit the same file.
const items = []
for (const it of plan.items) {
  const clash = items.find((o) => o.edit.some((f) => it.edit.includes(f)))
  if (clash) {
    clash.goal += ' Also: ' + it.goal
    clash.edit = [...new Set([...clash.edit, ...it.edit])]
    clash.readFirst = [...new Set([...(clash.readFirst || []), ...(it.readFirst || [])])]
    log(`merged overlapping items ${clash.id} and ${it.id}`)
  } else {
    items.push({ ...it, readFirst: it.readFirst || [] })
  }
}
if (plan.openQuestions && plan.openQuestions.length) log('Needs the owner: ' + plan.openQuestions.join(' | '))

phase('Build')
const built = (
  await parallel(
    items.map((it) => () =>
      agent(
        `Task overall: ${task}\n\nYour item (${it.id}): ${it.goal}\n` +
          `You may edit ONLY: ${it.edit.join(', ')}\nRead first, if you need context: ${it.readFirst.join(', ') || 'nothing'}\n\n` +
          `Make the change, keeping each file's one-line purpose comment accurate. Do not commit.\n\n${READ_RULE}`,
        { phase: 'Build', label: `build:${it.id}`, schema: BUILT }
      )
    )
  )
).filter(Boolean)
const changed = [...new Set(built.flatMap((b) => b.changed))]
log(`changed: ${changed.join(', ') || 'nothing'}`)

const verify = () =>
  parallel([
    () =>
      agent(
        'Run the checks described under "Checking changes" in CLAUDE.md and report pass=false with each problem if anything fails. ' +
          'Clean up anything you start (servers, temp files).',
        { phase: 'Verify', label: 'verify:checks', schema: CHECK, agentType: AGENTS.test }
      ),
    () =>
      agent(
        `Review \`git diff\` and untracked files against this task: ${task}\n` +
          'Try to REFUTE that the change is correct and safe. Look for: breaking a rule in CLAUDE.md or .claude/rules/, ' +
          'edits outside the planned files (' + changed.join(', ') + '), a page missing a script or stylesheet it now needs, broken links, ' +
          'a new file without the one-line purpose the repo map needs. Default to pass=false if you are unsure.',
        { phase: 'Verify', label: 'verify:review', schema: CHECK, agentType: AGENTS.review }
      ),
  ])

phase('Verify')
let results = (await verify()).filter(Boolean)
let problems = results.flatMap((r) => (r.pass ? [] : r.problems))
if (problems.length) {
  log(`fixing ${problems.length} problem(s), then re-verifying once`)
  await agent(
    `Fix these problems from verification of the task "${task}". Touch only what is needed.\n- ${problems.join('\n- ')}\n\n${READ_RULE}`,
    { phase: 'Verify', label: 'fix', schema: BUILT }
  )
  results = (await verify()).filter(Boolean)
  problems = results.flatMap((r) => (r.pass ? [] : r.problems))
}

phase('Docs')
if (!problems.length) {
  await agent(
    `The task "${task}" is done and verified (changed: ${changed.join(', ')}). Update docs/: add a dated line to docs/log.md, ` +
      `open a GitHub issue (search for duplicates first) for each fact only the owner can supply: ${(plan.openQuestions || []).join('; ') || 'none'}, ` +
      `and add docs/decisions.md only if a real decision was made. Bump \`updated:\` on notes you touch. Do not commit.`,
    { phase: 'Docs', label: 'docs' }
  )
}

return {
  task,
  changed,
  verified: problems.length === 0,
  remainingProblems: problems,
  openQuestions: plan.openQuestions || [],
  next: problems.length ? 'Fix the remaining problems by hand.' : 'Review the diff, then commit and push.',
}
