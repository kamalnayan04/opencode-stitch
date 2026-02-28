
# Superpowers Integration — Debug Mode

> These rules integrate the [superpowers](https://github.com/obra/superpowers) workflow into Debug mode.

## Skill Discovery

Skills are located at `.clinerules/skills/superpowers/`. When a skill applies, read the corresponding `SKILL.md` file to load its full instructions.

## Systematic Debugging (MANDATORY)

**Skill:** `.clinerules/skills/superpowers/systematic-debugging/SKILL.md`

### The Rule

```
NO FIXES WITHOUT ROOT CAUSE IDENTIFICATION
```

You MUST complete all 4 phases before implementing any fix.

### Phase 1: Investigation

- Reproduce the bug reliably
- Collect error messages, stack traces, logs
- Identify what changed recently (git log, recent commits)
- Document observed vs expected behavior

### Phase 2: Pattern Analysis

- Look for patterns in the failure
- Check if the issue is consistent or intermittent
- Identify the minimal reproduction case
- Map the code path from input to failure

### Phase 3: Hypothesis Testing

- Form specific, falsifiable hypotheses
- Test each hypothesis with targeted experiments
- Add diagnostic logging or breakpoints
- Narrow down to the exact root cause

### Phase 4: Implementation

- Fix the root cause (not symptoms)
- Write a regression test FIRST (TDD — test should fail without fix, pass with fix)
- Verify the fix doesn't break other tests
- Document what caused the bug and why the fix works

### Red Flags — STOP

- Jumping to a fix without understanding the cause → Go back to Phase 1
- "I think I know what's wrong" without evidence → Test the hypothesis first
- Fixing symptoms instead of root cause → The bug will return
- Skipping the regression test → You can't prove it's fixed

## Verification Before Completion

Before claiming a bug is fixed:
1. Show the regression test failing without the fix
2. Show the regression test passing with the fix
3. Show all other tests still passing
4. Explain the root cause and why the fix addresses it
