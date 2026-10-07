export const meta = {
  name: 'site-change',
  description: 'Plan, implement, verify and document a change to the AutoStacc site, reading only the files each step needs',
  whenToUse: 'A site change that touches more than one area (data, pages, scripts, styles). Pass args: { task: "what to change" }. Small one-file edits do not need it.',
  phases: [
    { title: 'Plan', detail: 'one agent maps the task to files using the repo map and Graphify' },
    { title: 'Build', detail: 'one agent per independent work item, disjoint files' },
    { title: 'Verify', detail: 'headless browser check and an adversarial diff review in parallel' },
    { title: 'Docs', detail: 'update status, log and decisions' },
  ],
}

const task = typeof args === 'string' ? args : args && args.task
if (!task) throw new Error('Pass args: { task: "what to change" }')

const READ_RULE =
  'Read in layers (see CLAUDE.md): start from the repo map (run .claude/hooks/tree.sh), use `graphify query/explain/affected` for questions, ' +
  'and open only files that are named. Use Grep or Read with offset/limit instead of whole files when you can. Never invent facts about the artist: ' +
  'use docs/ or mark it placeholder and note it for docs/status.md. Keep the site static, no build step, no modules.'

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
        'Verify the site in a headless browser. Serve the repo root with `python3 -m http.server 8000` in the background, ' +
          'load index.html, shop.html and news.html at 1280px and 390px wide using Playwright with executablePath /opt/pw-browsers/chromium, ' +
          'and check: no console errors, no horizontal overflow, header and footer render, and the shop filter changes the card count. ' +
          'Stop the server afterwards. Report pass=false with each problem if anything fails.',
        { phase: 'Verify', label: 'verify:browser', schema: CHECK }
      ),
    () =>
      agent(
        `Review \`git diff\` and untracked files against this task: ${task}\n` +
          'Try to REFUTE that the change is correct and safe. Look for: invented facts about the artist, a build step or framework, ' +
          'edits outside the planned files (' + changed.join(', ') + '), a page missing a script or stylesheet it now needs, broken links, ' +
          'a new file without a one-line purpose comment. Default to pass=false if you are unsure.',
        { phase: 'Verify', label: 'verify:review', schema: CHECK }
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
      `tick or add items in docs/status.md (including any owner-only facts: ${(plan.openQuestions || []).join('; ') || 'none'}), ` +
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
