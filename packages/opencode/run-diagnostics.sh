#!/bin/bash
echo "======================================="
echo "OpenCode Diagnostic Test"
echo "======================================="
echo ""
echo "Test 1: Running OpenCode with full output capture"
echo "-------------------------------------------"
cd /Users/kamal.nayan@grofers.com/StudioProjects/opencode/packages/opencode
bun run ./src/index.ts 2>&1 | tee opencode-debug-output.txt
EXIT_CODE=$?
echo ""
echo "=== Process exited with code: $EXIT_CODE ==="
echo ""

echo ""
echo "Test 2: Running with --help flag"
echo "-------------------------------------------"
bun run ./src/index.ts --help
echo ""

echo ""
echo "Test 3: Checking saved output"
echo "-------------------------------------------"
echo "First 50 lines of opencode-debug-output.txt:"
head -50 opencode-debug-output.txt
echo ""
echo "Total lines in output:"
wc -l opencode-debug-output.txt
echo ""

echo "======================================="
echo "Diagnostic tests complete"
echo "======================================="
