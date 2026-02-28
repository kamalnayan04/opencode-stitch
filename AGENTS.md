# OpenCode Development Guide for AI Agents

This guide provides essential information for AI coding agents working in the OpenCode repository.

## Project Overview

- **Monorepo**: Managed with Turborepo and Bun workspaces
- **Runtime**: Bun 1.3.9+ (required, enforced by pre-push hook)
- **Default Branch**: `dev` (not `main`)
- **Package Manager**: Bun (specified in `packageManager` field)

## Build & Development Commands

### Root Level (Monorepo)
```bash
bun install                    # Install all dependencies
bun dev                        # Run opencode in packages/opencode directory
bun dev <directory>            # Run opencode in specific directory
bun dev .                      # Run opencode in repo root
bun typecheck                  # Type check all packages (via Turbo)
```

### Package Level (packages/opencode)
```bash
cd packages/opencode
bun dev                        # Start development server
bun test                       # Run all tests (30s timeout)
bun test <file>                # Run specific test file
bun test --watch               # Run tests in watch mode
bun typecheck                  # Type check this package only
bun run build                  # Build the package
bun run db generate --name <slug>  # Generate database migration
```

### Web UI (packages/app)
```bash
cd packages/app
bun dev                        # Start Vite dev server
bun test:unit                  # Run unit tests
bun test:unit:watch            # Run unit tests in watch mode
bun test:e2e                   # Run Playwright e2e tests
bun test:e2e:ui                # Run e2e tests with UI
bun typecheck                  # Type check
```

### SDK Generation
```bash
./packages/sdk/js/script/build.ts  # Regenerate JavaScript SDK
```

### Building Standalone Executable
```bash
./packages/opencode/script/build.ts --single  # Build localcode executable
./packages/opencode/dist/opencode-<platform>/bin/opencode  # Run it
```

## Testing

### Running Single Tests
```bash
# Run specific test file
cd packages/opencode
bun test test/ide/ide.test.ts

# Run tests matching pattern
bun test --test-name-pattern="should detect"

# Run with custom timeout
bun test --timeout 60000 test/snapshot/snapshot.test.ts
```

### Test Framework
- **Framework**: Bun's built-in test runner
- **Imports**: `import { describe, test, it, expect, afterEach, beforeEach } from "bun:test"`
- **Location**: Tests in `test/` directory or `__tests__/` subdirectories
- **Guard**: Tests CANNOT run from repo root (will fail with "do not run tests from root")

### Test Principles
- ✅ Test actual implementation, not mocks
- ✅ Avoid mocks as much as possible
- ✅ Do not duplicate logic into tests
- ✅ Use real data and real flows

## Code Style Guidelines

### General Principles
- Keep code in one function unless composable or reusable
- Avoid `try`/`catch` where possible (use error types instead)
- Avoid `any` type - use proper typing
- Prefer Bun APIs: `Bun.file()`, `Bun.$`, etc.
- Rely on type inference - avoid explicit annotations unless for exports
- Use functional array methods (`map`, `filter`, `flatMap`) over `for` loops
- Use type guards on `filter` to maintain type inference

### Naming Conventions
```typescript
// ✅ GOOD: Single word names
const foo = 1
function journal(dir: string) {}
const user = getUser()

// ❌ BAD: Multi-word names (only when necessary)
const fooBar = 1
function prepareJournal(dir: string) {}
const currentUser = getUser()
```

### Variables
```typescript
// ✅ GOOD: Prefer const, inline single-use values
const journal = await Bun.file(path.join(dir, "journal.json")).json()
const foo = condition ? 1 : 2

// ❌ BAD: Unnecessary intermediate variables
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()

let foo
if (condition) foo = 1
else foo = 2
```

### Destructuring
```typescript
// ✅ GOOD: Use dot notation to preserve context
obj.a
obj.b
config.timeout

// ❌ BAD: Unnecessary destructuring loses context
const { a, b } = obj
const { timeout } = config
```

### Control Flow
```typescript
// ✅ GOOD: Early returns, no else
function foo() {
  if (condition) return 1
  return 2
}

function validate(input: string) {
  if (!input) return false
  if (input.length < 3) return false
  return true
}

// ❌ BAD: else statements
function foo() {
  if (condition) {
    return 1
  } else {
    return 2
  }
}
```

### Imports
```typescript
// Path aliases (tsconfig.json)
import { Bus } from "@/bus"                    // @/* maps to ./src/*
import { Component } from "@tui/*"             // @tui/* maps to ./src/cli/cmd/tui/*

// External packages
import z from "zod"
import path from "path"
import { spawn } from "bun"

// Workspace packages
import { NamedError } from "@opencode-ai/util/error"
import { Slug } from "@opencode-ai/util/slug"
```

### Exports (Namespace Pattern)
```typescript
// ✅ GOOD: Export namespace with functions
export namespace Session {
  export function create(input: CreateInput) {}
  export function fork(sessionID: string) {}
  export const Event = { /* ... */ }
}

// Usage
import { Session } from "./session"
Session.create({ ... })
```

### Error Handling
```typescript
// ✅ GOOD: Named errors with schema
const NotFoundError = NamedError.create("NotFound", z.object({
  resource: z.string()
}))

throw new NotFoundError({ resource: "session" })

// ✅ GOOD: Early validation
function process(id: string) {
  if (!id) throw new Error("ID required")
  // continue processing
}

// ❌ BAD: try/catch for control flow (avoid unless necessary)
try {
  const result = await operation()
  return result
} catch (e) {
  return null
}
```

## Database (Drizzle ORM)

### Schema Definitions
```typescript
// ✅ GOOD: Use snake_case for columns (matches SQL conventions)
const SessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
  time_initialized: integer(),
})

// ❌ BAD: camelCase requires explicit column names
const SessionTable = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),  // Redundant
  createdAt: integer("created_at").notNull(),
})
```

### Migrations
- **Schema Location**: `./src/**/*.sql.ts`
- **Output Directory**: `./migration`
- **Generate Migration**: `bun run db generate --name <slug>`
- **Output Format**: `migration/<timestamp>_<slug>/migration.sql` + `snapshot.json`
- **Naming**: Tables/columns use `snake_case`, join columns are `<entity>_id`, indexes are `<table>_<column