
## Self-Learning Rule

When working on any task, if you discover new patterns, conventions, or best practices specific to this codebase that are not already documented in the skill files under `.clinerules/skills/`, you should:

1. **Identify the learning** — Recognize when you've learned something new about the project's architecture, coding patterns, utility methods, or conventions.
2. **Update or create a skill file** — Update the relevant existing skill file in `.clinerules/skills/`, or create a new one if no appropriate skill file exists.
3. **Keep skills concise and actionable** — Skill files should contain clear rules, patterns, and code examples that can guide future tasks. Avoid verbose explanations.
4. **Always read skills first** — Before starting any task that matches a skill topic, read the relevant skill files from `.clinerules/skills/` to apply established patterns.

### When to update skills:
- When you discover a utility method that should be preferred over manual implementations
- When you learn how a specific pattern (e.g., interactions, data binding, custom drawables) works in this codebase
- When you encounter a bug caused by a pattern that should be avoided
- When the user corrects your approach and the correction represents a reusable pattern
- When you find that an existing skill is incomplete or outdated

### Skill file naming:
- Use kebab-case: `create-snippet.md`, `kotlin-coding-guidelines.md`, `custom-drawables.md`
- Group related guidelines in a single file rather than creating many small files
