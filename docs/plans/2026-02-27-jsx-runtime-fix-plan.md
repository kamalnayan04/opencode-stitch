
# JSX Runtime Fix - Implementation Plan

**Date:** 2026-02-27  
**Author:** Stitch Architect Mode  
**Status:** Ready for Implementation  
**Design Doc:** [2026-02-27-jsx-runtime-fix-design.md](./2026-02-27-jsx-runtime-fix-design.md)

---

## 1. Goal

Remove browser conditions from package.json and tsconfig.json to fix JSX runtime resolution conflict preventing app startup.

---

## 2. Context

### Analysis Completed
- **Design Document:** [2026-02-27-jsx-runtime-fix-design.md](./2026-02-27-jsx-runtime-fix-design.md) evaluated 3 approaches and recommended Approach 1
- **Root Cause Identified:** The `--conditions=browser` flag forces Bun to use browser-specific module resolution, which expects React's JSX runtime instead of SolidJS (`@opentui/solid`)
- **Configuration Conflict:**
  - [`tsconfig.json:6`](../../packages/opencode/tsconfig.json:6) specifies `"jsxImportSource": "@opentui/solid"`
  - [`package.json:12`](../../packages/opencode/package.json:12) uses `--conditions=browser` flag
  - [`tsconfig.json:10`](../../packages/opencode/tsconfig.json:10) has `"customConditions": ["browser"]`

### Current State
- **Symptom:** App fails to start silently - no TUI renders
- **Error:** Bun cannot resolve `react/jsx-dev-runtime` when it should use SolidJS runtime
- **Impact:** Complete startup failure, no code execution happens
- **Files Affected:** 2 config files, no source code changes needed

### Why This Approach
- **Simplest Solution:** Removes root cause with minimal changes
- **Lowest Risk:** Only touches 2 config files, no code refactoring
- **Fastest Implementation:** < 5 minutes to implement
- **Standard Practice:** SolidJS apps don't typically need browser conditions for development
- **Maintainable:** Simplifies configuration rather than adding workarounds

---

## 3. Steps

### Step 1: Document Current State (Baseline)
**Action:** Capture the current failing behavior for comparison

1.1. Navigate to the opencode package directory:
```bash
cd opencode/packages/opencode
```

1.2. Attempt to run the dev server and capture the error:
```bash
bun run dev 2>&1 | tee /tmp/before-fix.log
```

1.3. Verify the specific error message contains "react/jsx-dev-runtime" or "Cannot resolve"

**Expected Result:** Command fails with JSX runtime resolution error

**Verification:** 
- Error log contains "react/jsx-dev-runtime" or similar JSX-related error
- App does not start (no TUI displays)
- Process exits with error code

---

### Step 2: Read Current Configuration Files
**Action:** Examine the exact current state of both config files

2.1. Read package.json to confirm current dev script:
```bash
cat package.json | grep -A 1 '"dev"'
```

2.2. Read tsconfig.json to confirm current customConditions:
```bash
cat tsconfig.json | grep -A 2 'customConditions'
```

**Expected Result:** 
- package.json shows: `"dev": "bun run --conditions=browser ./src/index.ts"`
- tsconfig.json shows: `"customConditions": ["browser"]`

**Verification:**
- Both files contain the problematic browser conditions
- File contents match design document references

---

### Step 3: Update package.json Dev Script
**Action:** Remove the `--conditions=browser` flag from the dev script

3.1. Edit [`package.json:12`](../../packages/opencode/package.json:12)

3.2. Change:
```json
"dev": "bun run --conditions=browser ./src/index.ts"
```

3.3. To:
```json
"dev": "bun run ./src/index.ts"
```

**Expected Result:** Dev script no longer includes browser conditions flag

**Verification:**
```bash
cat package.json | grep '"dev"'
```
- Output should show: `"dev": "bun run ./src/index.ts"`
- No `--conditions=browser` flag present
- File is valid JSON (no syntax errors)

---

### Step 4: Update tsconfig.json Custom Conditions
**Action:** Remove the `customConditions` array from compiler options

4.1. Edit [`tsconfig.json:10`](../../packages/opencode/tsconfig.json:10)

4.2. Remove the entire line:
```json
"customConditions": ["browser"],
```

4.3. Ensure proper JSON formatting (no trailing commas if this was the last item)

**Expected Result:** tsconfig.json no longer contains customConditions

**Verification:**
```bash
cat tsconfig.json | grep 'customConditions'
```
- Command returns empty (no matches found)
- File remains valid JSON:
```bash
bun run tsc --noEmit --project tsconfig.json
```
- No JSON parsing errors

---

### Step 5: Test Application Startup
**Action:** Verify the app now starts successfully

5.1. Clear any cached modules:
```bash
rm -rf node_modules/.cache 2>/dev/null || true
```

5.2. Run the dev script:
```bash
bun run dev
```

5.3. Observe startup behavior for 5-10 seconds

**Expected Result:** 
- App starts without errors
- No JSX runtime resolution errors
- Process runs continuously (doesn't exit)
- Terminal shows TUI rendering or ready state

**Verification:**
- No error messages in console
- Process exit code is 0 when interrupted (Ctrl+C)
- Compare with baseline from Step 1 - error is gone

---

### Step 6: Test JSX Component Rendering
**Action:** Verify SolidJS components work correctly without browser conditions

6.1. With app running from Step 5, test basic TUI interaction:
- Observe initial UI render
- Navigate through any menu items if present
- Verify text displays correctly

6.2. Check for any console warnings or errors related to:
- JSX runtime
- Module resolution
- Component rendering

**Expected Result:**
- TUI components render correctly
- No JSX-related errors or warnings
- SolidJS reactivity works as expected

**Verification:**
- Visual confirmation: UI elements display properly
- No error messages in terminal
- App responds to input (if interactive)

---

### Step 7: Test All TUI Commands
**Action:** Verify complete functionality across all command surfaces

7.1. Test the `attach` command if present:
```bash
# In a new terminal
cd opencode/packages/opencode
bun run dev attach --help
```

7.2. Test the `thread` command if present:
```bash
bun run dev thread --help
```

7.3. Test any other TUI-related commands documented in the project

**Expected Result:**
- All commands execute without JSX errors
- Help text displays correctly
- No regression in functionality

**Verification:**
- Each command runs to completion
- No new errors introduced
- Exit codes are 0 for successful operations

---

### Step 8: Run Existing Test Suite
**Action:** Ensure no regressions in existing tests

8.1. Run the test suite:
```bash
bun test
```

8.2. Check for any new failures related to:
- JSX rendering
- Component initialization
- Module resolution

**Expected Result:**
- All existing tests pass
- No new test failures introduced
- Test coverage remains the same

**Verification:**
- Test output shows all tests passing
- No additional errors in test logs
- Compare test count before/after (should be same)

---

### Step 9: Test Production Build
**Action:** Verify the build process still works correctly

9.1. Create a production build:
```bash
bun run build
```

9.2. Check build output for warnings or errors

9.3. If build script exists, verify generated artifacts

**Expected Result:**
- Build completes successfully
- No JSX-related build errors
- Output bundle is generated correctly

**Verification:**
```bash
ls -lh dist/ 2>/dev/null || echo "No dist directory"
```
- Build artifacts exist (if applicable)
- No error messages during build
- Build exit code is 0

---

### Step 10: Document Changes and Close
**Action:** Update documentation and mark task complete

10.1. Create a brief changelog entry if changelog exists:
```markdown
## [Date] - JSX Runtime Fix
- Removed `--conditions=browser` flag from package.json dev script
- Removed `customConditions: ["browser"]` from tsconfig.json
- Fixed: App startup failure due to JSX runtime resolution conflict
```

10.2. Update any relevant README sections about running the app

10.3. Commit changes with descriptive message:
```bash
git add package.json tsconfig.json
git commit -m "fix: remove browser conditions to resolve JSX runtime conflict

- Remove --conditions=browser flag from dev script
- Remove customConditions from tsconfig.json
- Fixes app startup failure with react/jsx-dev-runtime error
- SolidJS JSX now resolves correctly without browser conditions

Ref: docs/plans/2026-02-27-jsx-runtime-fix-plan.md"
```

**Expected Result:**
- Changes are committed with clear explanation
- Documentation is updated if needed
- Task is marked complete

**Verification:**
- Git commit exists with both file changes
- Commit message clearly explains the fix
- Branch is ready for review/merge

---

## 4. Verification

### Step-by-Step Verification Summary

| Step | Verification Command | Expected Output |
|------|---------------------|-----------------|
| 1 | `bun run dev 2>&1 \| tee /tmp/before-fix.log` | Error with "react/jsx-dev-runtime" |
| 2 | `cat package.json \| grep '"dev"'` | Shows `--conditions=browser` flag |
| 3 | `cat package.json \| grep '"dev"'` | No `--conditions=browser` flag |
| 4 | `cat tsconfig.json \| grep customConditions` | No output (not found) |
| 5 | `bun run dev` | App starts, no JSX errors |
| 6 | Visual inspection | TUI renders correctly |
| 7 | `bun run dev [command] --help` | Commands work |
| 8 | `bun test` | All tests pass |
| 9 | `bun run build` | Build succeeds |
| 10 | `git log -1 --oneline` | Commit exists |

### Overall Success Criteria

**Must Pass:**
- ✅ App starts without JSX runtime errors (Step 5)
- ✅ SolidJS components render correctly (Step 6)
- ✅ All TUI commands work (Step 7)
- ✅ No test regressions (Step 8)

**Should Pass:**
- ✅ Build process succeeds (Step 9)
- ✅ Changes are committed (Step 10)

**Critical Verification:**
```bash
# Complete end-to-end verification
cd opencode/packages/opencode
bun run dev &
DEV_PID=$!
sleep 5
if ps -p $DEV_PID > /dev/null; then
  echo "✅ SUCCESS: App is running"
  kill $DEV_PID
else
  echo "❌ FAILURE: App failed to start"
fi
```

### Edge Cases to Check

1. **Cold Start:** Clear all caches and restart
   ```bash
   rm -rf node_modules/.cache .bun-cache
   bun install
   bun run dev
   ```

2. **Different Bun Versions:** Verify fix works across Bun versions if multiple are used

3. **CI/CD Pipeline:** Ensure automated tests still pass after changes

4. **Module Resolution:** Check if any other modules depended on browser conditions
   ```bash
   grep -r "customConditions" . --include="*.json"
   ```

---

## 5. Risks

### Risk 1: Functionality Depending on Browser Conditions
**Likelihood:** Medium  
**Impact:** High  
**Description:** Some modules or features may have been added specifically to use browser conditions

**Mitigation:**
- Monitor console for new warnings after removing conditions
- Test all major features thoroughly in Step 7
- Check git history: `git log --all --grep="browser" --grep="conditions" -i` to see why they were added
- If browser-specific code exists, use conditional imports for those modules only

**Rollback:**
```bash
git revert HEAD  # Undo the config changes
bun run dev      # Verify app works with old config
```

---

### Risk 2: Module Resolution Changes Affect Dependencies
**Likelihood:** Low  
**Impact:** Medium  
**Description:** Dependencies might expect browser environment and fail without browser conditions

**Mitigation:**
- Review package.json dependencies for browser-specific packages
- Test Step 8 catches any dependency issues
- Check for polyfills or browser APIs in use:
  ```bash
  grep -r "window\." src/ --include="*.ts*"
  grep -r "document\." src/ --include="*.ts*"
  ```

**Fallback:**
- Add explicit module resolution for problematic dependencies only
- Use conditional imports: `if (typeof window !== 'undefined')`

---

### Risk 3: TypeScript Compilation Issues
**Likelihood:** Very Low  
**Impact:** Low  
**Description:** Removing customConditions might affect TypeScript's module resolution

**Mitigation:**
- Step 4 verification includes `tsc --noEmit` check
- TypeScript's jsxImportSource should handle SolidJS correctly
- Monitor for type errors after change

**Rollback:**
- If TypeScript errors appear, restore customConditions
- Investigate if TypeScript-specific configuration is needed

---

### Risk 4: Build Process Breaks
**Likelihood:** Very Low  
**Impact:** High  
**Description:** Production build might depend on browser conditions

**Mitigation:**
- Step 9 explicitly tests build process
- Check build configuration for condition-specific logic
- Review build output for warnings

**Fallback:**
- Use different conditions for dev vs. build:
  ```json
  "dev": "bun run ./src/index.ts",
  "build": "bun run --conditions=browser build.ts"
  ```

---

### Risk 5: Hidden Dependencies on React
**Likelihood:** Very Low  
**Impact:** Medium  
**Description:** Some code might accidentally import React instead of SolidJS

**Mitigation:**
- Search codebase for React imports:
  ```bash
  grep -r "from 'react'" src/ --include="*.ts*"
  grep -r "from \"react\"" src/ --include="*.ts*"
  ```
- These imports would fail loudly during Step 6-7 testing
- Add linting rule to prevent React imports if needed

**Fallback:**
- Replace React imports with SolidJS equivalents
- Add alias if some shared code needs React compatibility

---

## Rollback Plan

If any step fails or unexpected issues occur:

```bash
# Immediate Rollback
cd opencode/packages/opencode
git checkout HEAD -- package.json tsconfig.json
bun run dev  # Verify original config works (with JSX error)

# Then investigate the specific failure:
# 1. What command failed?
# 2. What error message appeared?
# 3. Is it related to browser conditions or something else?

# Decision tree:
# - If JSX errors persist → May be deeper issue, investigate module cache
# - If new errors appear → Specific feature needs browser conditions
# - If tests fail → Test may have hard-coded assumptions
```

---

## Timeline

**Total Estimated Time:** 10-15 minutes

- Steps 1-2: 2 minutes (documentation/baseline)
- Steps 3-4: 2 minutes (config changes)
- Steps 5-7: 5 minutes (functional testing)
- Steps 8-9: 3 minutes (automated testing)
- Step 10: 3 minutes (documentation/commit)

---

## Success Metrics

**Technical Metrics:**
- App startup time: Should be ~same or faster
- Error count: Reduced by 1 (JSX runtime error)
- Test pass rate: Maintained at 100%
- Build success: Yes

**Functional Metrics:**
- All TUI commands work: Yes
- Component rendering: Correct
- User interaction: Responsive

**Quality Metrics:**
- Code complexity: Reduced (simpler config)
- Maintainability: Improved (fewer special cases)
- Documentation: Updated and clear

---

## References

- **Design Document:** [2026-02-27-jsx-runtime-fix-design.md](./2026-02-27-jsx-runtime-fix-design.md)
- **Config Files:** 
  - [`package.json`](../../packages/opencode/package.json)
  - [`tsconfig.json`](../../packages/opencode/tsconfig.json)
- **TUI Entry Point:** [`src/index.ts`](../../packages/opencode/src/index.ts)
- **TUI App:** [`src/cli/cmd/tui/app.tsx`](../../packages/opencode/src/cli/cmd/tui/app.tsx)
- **JSX Source:** `@opentui/solid` (SolidJS-based TUI framework)

---

**Next Step:** Switch to Code mode to execute this plan step-by-step
