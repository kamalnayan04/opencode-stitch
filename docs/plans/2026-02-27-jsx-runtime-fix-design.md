
# JSX Runtime Resolution Fix - Design Document

**Date:** 2026-02-27  
**Author:** Stitch Architect Mode  
**Status:** Brainstorming Complete - Ready for Implementation Decision

---

## Problem Statement

The OpenCode TUI application fails to start due to a JSX runtime resolution conflict:

- **Error:** Bun cannot resolve `react/jsx-dev-runtime` when running with `--conditions=browser` flag
- **Root Cause:** Configuration mismatch between:
  - [`tsconfig.json`](../../packages/opencode/tsconfig.json:6) specifying `"jsxImportSource": "@opentui/solid"` (SolidJS)
  - [`package.json`](../../packages/opencode/package.json:12) dev script using `bun run --conditions=browser`
  - Browser conditions triggering React JSX runtime lookup instead of SolidJS
- **Impact:** Module loading fails before any code execution, causing silent startup failure

---

## Phase 1: DIVERGE - Solution Approaches

### Approach 1: Remove Browser Conditions Flag

**Description:**  
Remove the `--conditions=browser` flag from the dev script and the `customConditions` from tsconfig.json. This eliminates the source of the JSX runtime conflict entirely.

**Technical Changes:**
1. Update [`package.json:12`](../../packages/opencode/package.json:12): Change `"dev": "bun run --conditions=browser ./src/index.ts"` to `"dev": "bun run ./src/index.ts"`
2. Update [`tsconfig.json:10`](../../packages/opencode/tsconfig.json:10): Remove `"customConditions": ["browser"]`
3. Verify all TUI components still function without browser conditions

**Why This Works:**  
The browser conditions are forcing Bun to use browser-specific module resolution, which expects React's JSX runtime. By removing these conditions, Bun will use the default resolution which respects the `jsxImportSource` directive for SolidJS.

---

### Approach 2: Add Explicit JSX Runtime Resolution

**Description:**  
Configure Bun's module resolution to explicitly map JSX runtime imports to SolidJS instead of React, allowing browser conditions to coexist with SolidJS.

**Technical Changes:**
1. Add resolution mapping to [`bunfig.toml`](../../packages/opencode/bunfig.toml):
```toml
[alias]
"react/jsx-runtime" = "@opentui/solid/jsx-runtime"
"react/jsx-dev-runtime" = "@opentui/solid/jsx-runtime"
```

2. Alternatively, add Bun-specific import map in a new config file or use package.json imports field:
```json
{
  "imports": {
    "react/jsx-runtime": "@opentui/solid/jsx-runtime",
    "react/jsx-dev-runtime": "@opentui/solid/jsx-runtime"
  }
}
```

3. Keep browser conditions in place but override JSX resolution

**Why This Works:**  
This explicitly tells Bun's module resolver that when code requests React's JSX runtime (triggered by browser conditions), it should use SolidJS's runtime instead. This fixes the resolution without removing the browser conditions.

---

### Approach 3: Lazy Load TUI Components

**Description:**  
Restructure the entry point to delay JSX component loading until after initial runtime setup, using dynamic imports to bypass early resolution issues.

**Technical Changes:**
1. Modify [`src/index.ts`](../../packages/opencode/src/index.ts) to defer TUI loading:
```typescript
// Keep existing CLI setup
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
// ... other non-JSX imports

// Lazy load TUI commands
async function loadTuiCommands() {
  const { AttachCommand } = await import("./cli/cmd/tui/attach")
  const { TuiThreadCommand } = await import("./cli/cmd/tui/thread")
  return { AttachCommand, TuiThreadCommand }
}

// In command registration:
yargs.command({
  command: "attach",
  handler: async (args) => {
    const { AttachCommand } = await loadTuiCommands()
    await AttachCommand.handler(args)
  }
})
```

2. Wrap [`app.tsx`](../../packages/opencode/src/cli/cmd/tui/app.tsx) loading in async import
3. Add runtime JSX initialization before first component load

**Why This Works:**  
By deferring JSX component loading until after the runtime is fully initialized, we avoid early module resolution conflicts. The dynamic import gives us control over when JSX resolution happens.

---

## Phase 2: EVALUATE - Analysis

### Approach 1: Remove Browser Conditions

**Pros:**
- ✅ Simplest solution - minimal code changes
- ✅ Directly addresses root cause
- ✅ No additional configuration complexity
- ✅ Fastest to implement (< 5 minutes)
- ✅ Lowest risk of unintended side effects

**Cons:**
- ❌ May break functionality that depends on browser conditions
- ❌ Need to verify why browser conditions were added initially
- ❌ Could affect other modules expecting browser resolution

**Risks:**
- **Medium:** If browser conditions were added for a specific reason (e.g., polyfills, browser-specific APIs), removing them might break other features
- **Low:** JSX resolution should work fine without browser conditions

**Effort:** **LOW**  
Single-line changes to 2 config files, minimal testing required.

---

### Approach 2: Add Explicit JSX Runtime Resolution

**Pros:**
- ✅ Keeps browser conditions in place
- ✅ Surgical fix - only affects JSX resolution
- ✅ Maintains existing architecture
- ✅ Clear intent in configuration
- ✅ Future-proof if more React-expecting modules are added

**Cons:**
- ❌ Adds configuration complexity
- ❌ May not work if Bun's alias feature doesn't support this pattern
- ❌ Creates implicit coupling between React imports and SolidJS
- ❌ Harder to debug if resolution issues persist

**Risks:**
- **High:** Bun's alias/import map feature might not work with JSX runtime resolution in the expected way
- **Medium:** Other parts of the codebase might break if they expect actual React
- **Low:** Performance impact from resolution mapping

**Effort:** **MEDIUM**  
Requires testing Bun's alias feature, potential fallback solutions, and comprehensive verification.

---

### Approach 3: Lazy Load TUI Components

**Pros:**
- ✅ No configuration changes needed
- ✅ Provides fine-grained control over module loading
- ✅ Can add initialization logic before JSX loads
- ✅ Might improve startup time (lazy loading)

**Cons:**
- ❌ Significant code refactoring required
- ❌ Adds complexity to entry point and command structure
- ❌ Async imports throughout codebase
- ❌ Harder to maintain long-term
- ❌ Doesn't fix root cause, just works around it
- ❌ May introduce race conditions or timing issues

**Risks:**
- **High:** Complex refactoring increases chance of bugs
- **High:** Hard to ensure all JSX loading points are properly lazy-loaded
- **Medium:** Error handling becomes more complex with async imports
- **Low:** Performance degradation from dynamic imports

**Effort:** **HIGH**  
Requires refactoring entry points, command handlers, and potentially many import statements. Extensive testing needed.

---

## Phase 3: CONVERGE - Recommendation

### **RECOMMENDED: Approach 1 - Remove Browser Conditions Flag**

**Decision Rationale:**

1. **Addresses Root Cause:** Directly fixes the configuration conflict causing the issue
2. **Lowest Complexity:** Minimal changes reduce risk of introducing new bugs
3. **Fastest Implementation:** Can be completed and tested in < 5 minutes
4. **Maintainability:** Simplifies configuration rather than adding complexity
5. **Standard Practice:** SolidJS applications typically don't require browser conditions for development

**Why Not Approach 2?**
- Higher risk: Bun's alias feature behavior with JSX runtime is unclear
- Adds configuration complexity that may be hard to debug
- Works around the problem rather than fixing the root cause
- Creates implicit coupling that future maintainers may not understand

**Why Not Approach 3?**
- Highest effort with most code changes
- Doesn't fix the actual problem, just avoids it
- Adds significant complexity to maintain long-term
- Risk of introducing new bugs through extensive refactoring
- Async imports throughout codebase harm readability

**Verification Plan:**
1. Remove browser conditions from both files
2. Test TUI launch: `bun run dev`
3. Verify all TUI commands work correctly
4. Check if any features depended on browser conditions
5. If issues arise, investigate specific browser-dependent code paths

**Fallback Strategy:**
If removing browser conditions breaks other functionality:
1. Investigate what specifically requires browser conditions
2. Use conditional imports for those specific modules only
3. Keep core TUI working without browser conditions
4. Document browser-specific requirements

---

## Phase 4: DOCUMENT - Implementation Plan

### Immediate Actions (< 5 minutes)

1. **Update package.json:**
   - File: [`opencode/packages/opencode/package.json:12`](../../packages/opencode/package.json:12)
   - Change: `"dev": "bun run ./src/index.ts"`
   - Remove: `--conditions=browser` flag

2. **Update tsconfig.json:**
   - File: [`opencode/packages/opencode/tsconfig.json:10`](../../packages/opencode/tsconfig.json:10)
   - Remove: `"customConditions": ["browser"]` line

3. **Test launch:**
   ```bash
   cd opencode/packages/opencode
   bun run dev
   ```

4. **Verify functionality:**
   - TUI renders correctly
   - JSX components load without errors
   - All commands work as expected

### Why Alternatives Were Rejected

**Approach 2 (Explicit Resolution Mapping):**
- Rejected due to high uncertainty about Bun's alias support for JSX runtime
- Adds unnecessary complexity when simpler solution exists
- Creates maintainability burden with implicit couplings

**Approach 3 (Lazy Loading):**
- Rejected due to high implementation cost vs. benefit
- Doesn't fix root cause
- Introduces architectural complexity for workaround solution
- Risk of bugs from extensive refactoring outweighs benefits

---

## Success Criteria

- ✅ TUI launches without JSX runtime errors
- ✅ SolidJS components render correctly
- ✅ No regression in existing functionality
- ✅ Build and dev scripts work without errors
- ✅ Solution is documented and maintainable

---

## References

- Problem Location: [`app.tsx:1`](../../packages/opencode/src/cli/cmd/tui/app.tsx:1)
- Config Files: [`tsconfig.json`](../../packages/opencode/tsconfig.json), [`package.json`](../../packages/opencode/package.json)
- JSX Source: `@opentui/solid` (SolidJS-based TUI framework)
- Runtime: Bun with custom conditions

---

**Next Step:** Switch to Code mode to implement Approach 1
