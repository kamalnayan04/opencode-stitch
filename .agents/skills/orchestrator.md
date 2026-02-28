
# Superpowers Integration — Orchestrator (Stitch)

> These rules integrate the [superpowers](https://github.com/obra/superpowers) workflow into the Stitch orchestrator mode.

## Skill Discovery

Skills are located at `.clinerules/skills/superpowers/`. When a skill applies, read the corresponding `SKILL.md` file to load its full instructions before proceeding.

## Core Principle: Skill Check Before Action

Before ANY response or action — including clarifying questions — check if a skill applies. If there is even a 1% chance a skill is relevant, read it and follow it.

**Red flag thoughts that mean STOP and check skills:**
- "This is just a simple question"
- "I need more context first"
- "Let me explore the codebase first"
- "This doesn't need a formal skill"

## Workflow: How Stitch Uses Superpowers

### 1. New Feature / Creative Work Request

**Skill chain:** brainstorming → writing-plans → (subagent-driven-development OR executing-plans)

1. **Delegate brainstorming to Architect mode** — Create a new_task in architect mode with instructions to follow `.clinerules/skills/superpowers/brainstorming/SKILL.md`. The architect must explore context, ask questions one at a time, propose 2-3 approaches, get user approval, and write a design doc to `docs/plans/YYYY-MM-DD-<topic>-design.md`.

2. **Delegate plan writing to Architect mode** — After design approval, create a new_task in architect mode with instructions to follow `.clinerules/skills/superpowers/writing-plans/SKILL.md`. Plans go to `docs/plans/YYYY-MM-DD-<feature-name>.md` with bite-sized TDD tasks.

3. **Execute the plan** — Choose execution strategy:
	- **Subagent-driven (this session):** Dispatch fresh code-mode tasks per plan task, with review between each. Follow `.clinerules/skills/superpowers/subagent-driven-development/SKILL.md`.
	- **Batch execution:** Delegate to code mode in batches of 3 tasks, review between batches. Follow `.clinerules/skills/superpowers/executing-plans/SKILL.md`.

### 2. Bug Fix / Debugging Request

**Skill chain:** systematic-debugging → (fix with TDD) → verification-before-completion

1. **Delegate to Debug mode** — Create a new_task in debug mode with instructions to follow `.clinerules/skills/superpowers/systematic-debugging/SKILL.md`. Must complete all 4 phases: Investigation → Pattern Analysis → Hypothesis Testing → Implementation.

2. **Delegate fix to Code mode** — After root cause identified, create implementation task following TDD.

3. **Verify** — Before claiming completion, follow verification-before-completion.

### 3. Any Task Completion

Before using attempt_completion, ensure the verification-before-completion skill has been followed. Evidence before claims — run verification commands and confirm output.

### 4. Parallel Independent Tasks

When facing 2+ independent tasks without shared state, use `.clinerules/skills/superpowers/dispatching-parallel-agents/SKILL.md`. Dispatch one new_task per independent problem domain.

## Task Delegation Template

When creating new_task for any mode, always include:
1. The specific skill file path to follow (e.g., "Follow the workflow in `.clinerules/skills/superpowers/test-driven-development/SKILL.md`")
2. All necessary context from parent task
3. Clearly defined scope
4. Instruction to use attempt_completion with thorough summary

## HARD GATES

- **No code without design approval** — For new features, brainstorming must complete before any implementation task is created.
- **No implementation without a plan** — writing-plans must produce a plan before executing-plans or subagent-driven-development begins.
- **No completion without verification** — All tasks must have evidence of success before attempt_completion.
- **No fixing without root cause** — Debug tasks must identify root cause before implementing fixes.
