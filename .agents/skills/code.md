
# Superpowers Integration — Code Mode

> These rules integrate the [superpowers](https://github.com/obra/superpowers) workflow into Code mode.

## Skill Discovery

Skills are located at `.clinerules/skills/superpowers/`. When a skill applies, read the corresponding `SKILL.md` file to load its full instructions.

## Test-Driven Development (MANDATORY)

**Skill:** `.clinerules/skills/superpowers/test-driven-development/SKILL.md`

### The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it. Start over. No exceptions.

### Red-Green-Refactor Cycle

1. **RED** — Write ONE failing test showing desired behavior
2. **Verify RED** — Run it, confirm it fails for the right reason (missing feature, not typo)
3. **GREEN** — Write MINIMAL code to pass the test (no over-engineering, no YAGNI violations)
4. **Verify GREEN** — Run it, confirm it passes AND all other tests still pass
5. **REFACTOR** — Clean up while keeping tests green
6. **Repeat** — Next failing test for next behavior

### Common Rationalizations to Reject

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "TDD will slow me down" | TDD is faster than debugging. |

## Verification Before Completion (MANDATORY)

**Skill:** `.clinerules/skills/superpowers/verification-before-completion/SKILL.md`

Before using attempt_completion or claiming work is done:

1. **Run all relevant tests** — not just the new ones
2. **Run linter/compiler** — zero errors
3. **Show evidence** — include actual command output in your completion summary
4. **No assumptions** — "it should work" is not evidence

## Executing Plan Tasks

When given a plan task from the orchestrator:

1. Read the task specification completely
2. Follow each step exactly as written
3. Follow TDD for all implementation steps
4. Run all verification commands specified
5. Commit after each completed task with descriptive message
6. Report what was implemented, verification output, and any issues

## Red Flags — STOP

- Writing production code without a failing test → Delete and restart
- Test passes on first run → You're testing existing behavior, fix the test
- Skipping verification → Run the commands before claiming done
- "Close enough" → Either it passes or it doesn't
