# CLAUDE.md — Agent Operating Manual

> **Drop a completed `PRD.md` into this directory and start Claude Code. It handles the rest.**
>
> This is the single source of truth for agent behavior in this project.
> All conventions and workflows are defined here or in generated module files.

---

## Context Management

**This is the most important operational constraint.** Context window exhaustion degrades output quality silently. Every phase boundary is a context boundary.

### Rules

- **Before starting any phase**: Write a checkpoint to `IMPLEMENTATION.md` (see Checkpoint Format below).
- **After completing any phase**: Summarize results in `IMPLEMENTATION.md`, then **stop working and tell the user to exit and start a new Claude Code session.** You cannot clear your own context — the user must do this by exiting (`/exit` or Ctrl+C) and re-launching `claude`. Make this explicit every time: "Checkpoint written. Please exit this session and start a new one. Run `/recover` to pick up where we left off."
- **Within a phase**: Minimize context consumption — run targeted tests (not full suite), read only the files you need, avoid dumping large outputs.
- **If the conversation is getting long** within a single phase: Pause, write a mid-phase checkpoint, and tell the user to exit and restart. Do not ask permission — just write the checkpoint and stop.

### Checkpoint Format

Append to `IMPLEMENTATION.md` under a `## Session Log` section:

```markdown
### Checkpoint — YYYY-MM-DD HH:MM
- **Phase**: <current phase>
- **Completed**: <what was done this session>
- **State**: <current project state — what works, what's wired up>
- **Next**: <exact next action to take>
- **Blockers**: <anything unresolved>
- **Open Questions**: <decisions deferred to user>
```

---

## Bootstrap Protocol

**Trigger**: This directory contains `CLAUDE.md` and `PRD.md` but no `ARCHITECTURE.md`.

Execute the following phases. **Each phase ends with a checkpoint. You cannot clear your own context — you must tell the user to exit and restart Claude Code.**

### Phase 0: Init & Plan

```
1. git init (if no .git/ present)
2. Read PRD.md completely
3. Identify: language, framework, key dependencies, test framework
4. Create .gitignore appropriate to the identified stack
5. Commit: "chore: init project with CLAUDE.md and PRD.md"
```

**Planning gate**: Before proceeding to Phase 1, present to the user:
- Identified tech stack and framework choices
- High-level component breakdown (how you'll decompose the PRD)
- Any ambiguities, gaps, or assumptions in the PRD
- Proposed task count estimate

Wait for user confirmation. Then write checkpoint and **stop — tell the user to exit and start a new session for Phase 1. Remind them to run `/recover`.**

### Phase 1: Generate Module Files

```
1. Read PRD.md and Phase 0 checkpoint
2. Generate ARCHITECTURE.md from PRD system overview and confirmed stack
3. Generate IMPLEMENTATION.md with sequenced, dependency-ordered tasks
4. Generate DECISIONS.md with ADR-001 (stack choice) and any other initial decisions
5. Generate TESTING.md with strategy appropriate to the stack
6. Commit: "docs: generate project modules from PRD"
```

Rules for generation:
- Tasks in `IMPLEMENTATION.md` must be ordered by dependency — foundational work first.
- Every task has acceptance criteria with at least one testable condition.
- `ARCHITECTURE.md` includes a component diagram (ASCII or Mermaid).
- `DECISIONS.md` contains ADR-001 minimum. Add ADRs for every non-obvious assumption.

Write checkpoint and **stop — tell the user to exit and start a new session for Phase 2. Remind them to run `/recover`.**

### Phase 2: Scaffold

```
1. Read ARCHITECTURE.md and Phase 1 checkpoint
2. Create directory structure per ARCHITECTURE.md
3. Set up package/dependency management
4. Install dependencies
5. Configure linter/formatter
6. Set up test runner — verify it executes (even with zero tests)
7. Commit: "chore: scaffold project structure and tooling"
```

Write checkpoint and **stop — tell the user to exit and start a new session for Phase 3. Remind them to run `/recover`.**

### Phase 3: Validation Checkpoint

**This is the final gate before writing production code.**

Present to the user:
- Architecture summary and diagram
- Full task list with sequence and dependencies
- All assumptions logged in DECISIONS.md
- Confirmation that scaffold builds and test runner works
- Ask: "Ready to start TASK-001, or do you want to adjust anything first?"

After user confirms, write checkpoint and **stop — tell the user to exit and start a new session for Steady-State Development. Remind them to run `/recover` then `/next`.**

---

## Steady-State Development

### The Loop

```
Plan → Read → TDD → Self-Review → Commit → Update → Report
```

1. **Plan** (at phase/task start): Re-read `IMPLEMENTATION.md` checkpoint. For tasks touching >3 files or any P0 task, state the approach in 2–5 bullets and get user confirmation.
2. **Read**: Pull in only the files relevant to the current task.
3. **TDD**: Red → Green → Refactor (see TDD Rules).
4. **Self-Review**: Run the Definition of Done checklist before marking complete.
5. **Commit**: Atomic, conventional commit referencing the task ID.
6. **Update**: Mark task `DONE` in `IMPLEMENTATION.md` with date. Write checkpoint if session is long.
7. **Report**: One-line summary — files changed, tests added, anything noteworthy.

### Task Sequencing

- Work in dependency order, not priority order when hard dependencies exist.
- If `BLOCKED`, state the blocker, move to the next unblocked task, surface it to the user.
- When all tasks are `DONE`, pause and ask the user what's next.
- **After every 3–5 completed tasks**, write a checkpoint and tell the user: "Checkpoint written. Recommend exiting and starting a new session to keep context fresh. Run `/recover` to continue."

---

## Definition of Done

**No task is marked `DONE` until every applicable item passes.** Run this checklist before committing the final state of any task:

- [ ] All acceptance criteria from `IMPLEMENTATION.md` are met
- [ ] Tests pass (unit + integration where applicable)
- [ ] No hardcoded secrets, API keys, or environment-specific values
- [ ] Error handling covers all failure modes (network, invalid input, missing data)
- [ ] Input validation exists on all public boundaries (API endpoints, CLI args, function params)
- [ ] No leftover TODOs, FIXMEs, or commented-out code (unless explicitly deferred)
- [ ] No unused imports, dead code, or unused variables
- [ ] Public APIs have docstrings/JSDoc
- [ ] Logging exists at appropriate levels for debuggability
- [ ] Changes are consistent with `ARCHITECTURE.md` (update it if not)
- [ ] Any non-obvious decision is logged as an ADR in `DECISIONS.md`

---

## TDD Rules

**TDD is mandatory for all business logic, data transformations, and algorithms.**

```
Red → Green → Refactor → Commit
```

- **Red**: Write a failing test that defines expected behavior.
- **Green**: Write the *minimum* code to pass.
- **Refactor**: Clean up while keeping tests green.
- **Commit**: Atomic commit per cycle.

### When Test-After is Acceptable

TDD creates friction without proportional value for certain work. **Test-after is permitted for:**
- Configuration files and environment setup
- Scaffolding and boilerplate (routers, middleware wiring, DI containers)
- Integration glue code (connecting two already-tested components)
- Static UI layout and styling

Even for test-after code, tests must exist before the task is marked `DONE`.

### Test Quality

- Name tests for behavior: `test_<action>_<condition>_<expected>` — not `test_method_name`.
- Fast unit tests for all logic. Integration tests only at system boundaries.
- No flaky tests. No order-dependent tests. No sleeps.
- Mock at boundaries only (network, disk, clock). Never mock the thing under test.
- When a bug is found, write a regression test *before* fixing it.

---

## Error Recovery

**When the agent is stuck, it must stop digging and surface the problem.**

### Fix Loop Detection

If a test or build error persists after **3 distinct attempts** with different approaches:
1. **Stop.** Do not try a 4th approach.
2. Revert to last green state (`git stash` or `git checkout`).
3. Present to the user:
   - What you were trying to do
   - The 3 approaches attempted and why each failed
   - Your best hypothesis for the root cause
   - A suggested path forward (which may be "I need your input on X")

### Scope Creep Detection

Before starting any code change, check: "Is this within the current task's acceptance criteria?" If not:
1. Do not make the change.
2. Log it as a new task in `IMPLEMENTATION.md` backlog.
3. Continue with the current task.

### Context Degradation

If you notice yourself:
- Re-reading files you already read this session
- Producing output that contradicts earlier decisions
- Losing track of which task you're on

**Stop immediately.** Write a checkpoint and tell the user: "I'm experiencing context degradation. Please exit this session and start a new one. Run `/recover` to continue."

---

## Anti-Patterns — Never Do These

- **Don't add abstraction layers that aren't in the requirements.** No "just in case" interfaces, wrapper classes, or factory patterns unless the PRD or architecture demands it.
- **Don't create utility files or helper modules preemptively.** Extract shared code only when duplication actually exists in two or more places.
- **Don't use design patterns for their own sake.** A function is better than a Strategy pattern with one strategy.
- **Don't suppress or swallow errors.** Every error must be handled, logged, or propagated. Empty catch blocks are never acceptable.
- **Don't leave "clever" code unexplained.** If you need a comment to justify the approach, consider whether a simpler approach exists first.
- **Don't install a dependency for something achievable in <20 lines of code.**
- **Don't refactor code unrelated to the current task.** Log it as a separate task.
- **Don't generate placeholder or example data in production code.** Use proper defaults or configuration.
- **Don't write tests that test the framework/library instead of your code.**
- **Don't continue past a failing test.** Fix it or revert. Never skip and move on.

---

## Agent Interaction Rules

### Communication Style

- **Be direct.** No filler, no preamble, no "Great question!" openers.
- **State intent before action.** One sentence: "Adding input validation to the auth module."
- **Surface blockers immediately** with what you tried and what you need.
- **Never silently skip a failing test.** Surface it, explain it, fix it.
- **After each completed task**: summarize files changed, tests added, anything noteworthy.

### Autonomy Levels

#### Do Without Asking
- Fix lint/type/compile errors
- Add missing imports
- Write tests for code you're creating
- Refactor for clarity when intent is obvious
- Create atomic commits with conventional messages
- Update `IMPLEMENTATION.md` task status
- Add inline comments for complex logic

#### Ask First
- Change any public API, interface, or contract
- Add new dependencies beyond what the PRD specifies
- Modify architecture or data flow (triggers an ADR)
- Delete files or remove functionality
- Change CI/CD, build, or deploy configuration
- Deviate from the PRD requirements
- Any decision that warrants an ADR

#### During Bootstrap Only (No Confirmation Needed)
- Choose specific library versions
- Set default linter/formatter rules
- Define directory structure
- Create initial configuration files
- Make reasonable assumptions to fill PRD gaps (document them in DECISIONS.md)

---

## Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description> [TASK-NNN]
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`

Rules:
- One logical change per commit.
- Imperative mood: "add X" not "added X".
- Always reference the task ID.
- Never commit broken tests unless tagged `[WIP]` during a red phase.

---

## Code Quality

- **Readability over cleverness.** Clear names, small functions (~30 lines max), single responsibility.
- **Fail fast and loud.** Validate inputs early, throw meaningful errors with context.
- **Explicit over implicit.** No magic, no abbreviations (except universally known ones).
- **Typed/structured errors** — not bare strings or generic exceptions.
- **Docstrings on all public APIs.** Comments explain *why*, not *what*.
- **Minimize dependencies.** Justify each addition. Pin versions explicitly.

---

## Module File Formats

Generated during Bootstrap Phase 1 and maintained during Steady-State Development.

### ARCHITECTURE.md

```markdown
# ARCHITECTURE.md
## Overview — What the system does (one paragraph)
## System Diagram — ASCII or Mermaid showing components and data flow
## Components — For each: responsibility, location, interfaces, dependencies
## Tech Stack — Table: layer / technology / rationale
## Data Models — Key entities and relationships
## Boundaries & Constraints — Non-negotiable requirements
```

### IMPLEMENTATION.md

```markdown
# IMPLEMENTATION.md
## Current Focus — One sentence: the immediate priority
## Tasks — Sequenced, each with:
  - ID: TASK-NNN
  - Title, Status (TODO | IN PROGRESS | BLOCKED | DONE), Priority (P0–P2)
  - Description
  - Acceptance Criteria (checkboxes, at least one testable)
  - Notes / Blockers
## Completed — Finished tasks with dates
## Backlog — Unscheduled ideas
## Session Log — Checkpoints (see Context Management)
```

### DECISIONS.md

```markdown
# DECISIONS.md
## ADR Index — Table: number, title, status, date
## ADR-NNN: Title
  - Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
  - Date
  - Context: What prompted this?
  - Decision: What we chose and why
  - Consequences: Positive / negative / neutral tradeoffs
```

### TESTING.md

```markdown
# TESTING.md
## Test Commands — Run all, run one, run coverage
## Strategy — Unit / integration / e2e breakdown
## Coverage Targets — Per-scope minimums
## Conventions — File structure, naming, fixtures, mocking rules
```

---

## Slash Commands

Standard commands available in `.claude/commands/`:

| Command | Purpose |
|---|---|
| `/status` | Report current task, progress, blockers |
| `/next` | Plan the next TODO task |
| `/review` | Self-review diff against Definition of Done |
| `/checkpoint` | Write session checkpoint to IMPLEMENTATION.md |
| `/recover` | Full context recovery for new sessions |
| `/stuck` | Execute Error Recovery protocol |

---

## Architecture Decision Records

Create an ADR when:
- Choosing technologies or frameworks
- Changing data models or API contracts
- Making performance vs. simplicity tradeoffs
- Any security-related decision
- Anything a future contributor would ask "why?"

ADR-001 during bootstrap is always the primary stack choice with rationale.

---

## Context Recovery

New session? Follow this sequence (or use `/recover`):

1. Read `CLAUDE.md` (this file)
2. Read `ARCHITECTURE.md` → understand the system
3. Read `IMPLEMENTATION.md` → find latest checkpoint and current task
4. Read `DECISIONS.md` → check recent ADRs
5. Run the test suite → confirm project state
6. Resume from checkpoint, or ask the user

---

## Escape Hatches

- **"just do it"** → Skip confirmation for current task, increase autonomy.
- **"stop"** → Halt work, commit what's safe, write checkpoint, report status.
- **User overrides a convention** → Follow the override, document it as an ADR.
- **PRD is vague** → Make a reasonable choice, log in DECISIONS.md, flag at checkpoint.
