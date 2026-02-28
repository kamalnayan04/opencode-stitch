# Skills Inventory - OpenCode Repository

This document lists all available skills for AI agents working in this repository.

## Superpowers Skills (Priority)

Located at: `/Users/kamal.nayan@grofers.com/.codex/superpowers/skills/`

### Process Skills (Use First)

1. **brainstorming** - For new features/creative work
   - Path: `superpowers/brainstorming`
   - When: Starting any new feature or major change
   - Hard Gate: NO implementation without design approval

2. **systematic-debugging** - For bug fixes
   - Path: `superpowers/systematic-debugging`
   - When: Investigating bugs or unexpected behavior
   - Hard Gate: NO fixes without root cause identification
   - Phases: Investigation → Pattern Analysis → Hypothesis Testing → Implementation

3. **dispatching-parallel-agents** - For independent parallel work
   - Path: `superpowers/dispatching-parallel-agents`
   - When: Multiple independent tasks without shared state
   - Use: Launch background agents for parallel exploration

### Implementation Skills (Use Second)

4. **test-driven-development** - MANDATORY for all code
   - Path: `superpowers/test-driven-development`
   - Iron Law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST
   - Cycle: RED (write test) → Verify RED → GREEN (minimal code) → Verify GREEN → REFACTOR

5. **writing-plans** - For implementation planning
   - Path: `superpowers/writing-plans`
   - When: After design approval, before implementation
   - Output: `docs/plans/YYYY-MM-DD-<feature-name>.md`
   - Structure: Bite-sized tasks (2-5 min each), complete code, exact commands

6. **executing-plans** - For batch plan execution
   - Path: `superpowers/executing-plans`
   - When: Executing pre-written plans in batches
   - Process: Read task → Execute with TDD → Verify → Commit → Report

7. **subagent-driven-development** - For task-by-task execution
   - Path: `superpowers/subagent-driven-development`
   - When: Executing plans with review between each task
   - Process: Dispatch fresh agents per task, review between each

### Completion & Quality Skills

8. **verification-before-completion** - MANDATORY before claiming done
   - Path: `superpowers/verification-before-completion`
   - When: Before any attempt_completion
   - Requirements: Run tests, show evidence, no assumptions

9. **finishing-a-development-branch** - For PR preparation
   - Path: `superpowers/finishing-a-development-branch`
   - When: Ready to submit PR
   - Process: Final checks, cleanup, documentation

### Code Review Skills

10. **requesting-code-review** - Before submitting PR
    - Path: `superpowers/requesting-code-review`
    - When: Preparing to request review

11. **receiving-code-review** - Handling review feedback
    - Path: `superpowers/receiving-code-review`
    - When: Responding to review comments

### Git & Workflow Skills

12. **using-git-worktrees** - For parallel branch work
    - Path: `superpowers/using-git-worktrees`
    - When: Need to work on multiple branches simultaneously

13. **using-superpowers** - Meta-skill for skill system
    - Path: `superpowers/using-superpowers`
    - When: Understanding how to use the skill system

14. **using-advanced-tools** - For complex tool usage
    - Path: `superpowers/using-advanced-tools`
    - When: Need advanced tool capabilities

15. **writing-skills** - For creating new skills
    - Path: `superpowers/writing-skills`
    - When: Documenting new patterns discovered

## Project-Specific Skills

Located at: `/Users/kamal.nayan@grofers.com/StudioProjects/opencode/.agents/skills/`

1. **architect.md** - Superpowers integration for Architect mode
   - Brainstorming workflow
   - Plan writing workflow
   - Hard gates and process rules

2. **code.md** - Superpowers integration for Code mode
   - TDD mandatory workflow
   - Verification requirements
   - Executing plan tasks

3. **debug.md** - Superpowers integration for Debug mode
   - Systematic debugging workflow
   - 4-phase process
   - Verification requirements

4. **orchestrator.md** - Superpowers integration for Stitch/Orchestrator
   - Skill chain workflows
   - Task delegation templates
   - Hard gates enforcement

5. **rules.md** - Self-learning rules
   - When to update skills
   - Skill file naming conventions
   - Learning documentation process

## Built-in Skills (Lower Priority)

- **playwright** - Browser automation testing
- **frontend-ui-ux** - UI/UX development
- **git-master** - Advanced git operations
- **dev-browser** - Browser development tools

## Skill Usage Priority

1. **Process skills FIRST** (brainstorming, debugging) - determine HOW to approach
2. **Implementation skills SECOND** (TDD, executing-plans) - guide execution
3. **Completion skills ALWAYS** (verification-before-completion) - before claiming done

## Hard Gates (Non-Negotiable)

1. ❌ **No code without design approval** (brainstorming must complete first)
2. ❌ **No implementation without a plan** (writing-plans must complete first)
3. ❌ **No production code without failing test** (TDD mandatory)
4. ❌ **No fixes without root cause** (systematic-debugging phases required)
5. ❌ **No completion without verification** (evidence required)

## When to Invoke Skills

**ALWAYS invoke if there's even 1% chance a skill applies.**

Red flags that mean STOP and check skills:
- "This is just a simple question"
- "I need more context first"
- "Let me explore the codebase first"
- "This doesn't need a formal skill"
- "I'll just do this one thing first"
- "The skill is overkill"

## Skill Invocation Syntax

```typescript
// In Claude Code
Skill("superpowers/test-driven-development")

// In task delegation
task(
  category="code",
  load_skills=["superpowers/test-driven-development"],
  run_in_background=true
)
```

## Self-Learning Rule

When you discover new patterns, conventions, or best practices:
1. Identify the learning
2. Update or create skill file in `.agents/skills/`
3. Keep skills concise and actionable
4. Always read skills first before tasks

