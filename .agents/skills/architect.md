
# Superpowers Integration — Architect Mode

> These rules integrate the [superpowers](https://github.com/obra/superpowers) workflow into Architect mode.

## Skill Discovery

Skills are located at `.clinerules/skills/superpowers/`. When a skill applies, read the corresponding `SKILL.md` file to load its full instructions.

## Brainstorming (For New Features / Creative Work)

**Skill:** `.clinerules/skills/superpowers/brainstorming/SKILL.md`

### HARD GATE

Do NOT write any implementation plan, code, or scaffold until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.

### Process

1. **Explore project context** — Check files, docs, recent commits
2. **Ask clarifying questions** — ONE at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — With trade-offs and your recommendation
4. **Present design** — In sections scaled to complexity, get user approval after each section
5. **Write design doc** — Save to `docs/plans/YYYY-MM-DD-<topic>-design.md`
6. **Transition** — Signal completion so orchestrator can invoke writing-plans

### Key Principles

- **One question at a time** — Don't overwhelm
- **Multiple choice preferred** — Easier to answer
- **YAGNI ruthlessly** — Remove unnecessary features
- **Explore alternatives** — Always 2-3 approaches before settling

## Writing Plans (For Implementation)

**Skill:** `.clinerules/skills/superpowers/writing-plans/SKILL.md`

### Plan Structure

Plans are saved to `docs/plans/YYYY-MM-DD-<feature-name>.md` and must include:

**Header:**
```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
```

**Each task must have:**
- Exact file paths (create/modify/test)
- Complete code (not "add validation")
- Exact commands with expected output
- TDD steps: write test → verify fail → implement → verify pass → commit

### Bite-Sized Granularity

Each step is ONE action (2-5 minutes):
- "Write the failing test" — one step
- "Run it to verify it fails" — one step
- "Write minimal code to pass" — one step
- "Run tests to verify pass" — one step
- "Commit" — one step

### Remember

- DRY, YAGNI, TDD, frequent commits
- Assume the implementer has zero codebase context
- Document everything they need: which files, complete code, how to test
