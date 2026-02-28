#!/usr/bin/env python3
"""
Verify that the activity parsing fix works correctly.
This script tests the regex patterns against the actual error output.
"""

import re
import sys

def test_patterns():
    """Test all activity parsing patterns."""
    
    # Actual output from the error log
    sample_outputs = [
        # Output 1: topResumedActivity format
        """topResumedActivity=ActivityRecord{4e4099b u0 com.grofers.customerapp.staging/com.grofers.customerapp.DEFAULT t1037}""",
        
        # Output 2: Full activities dump
        """ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
Display #0 (activities from top to bottom):
  * Task{8e78138 #1037 type=standard A=10339:com.grofers.customerapp.staging U=0 visible=true visibleRequested=true mode=fullscreen translucent=false sz=1}
    mLastNonFullscreenBounds=Rect(81, 615 - 999, 1819)
    isSleeping=false
    topResumedActivity=ActivityRecord{4e4099b u0 com.grofers.customerapp.staging/com.grofers.customerapp.DEFAULT t1037}
    * Hist  #0: ActivityRecord{4e4099b u0 com.grofers.customerapp.staging/com.grofers.customerapp.DEFAULT t1037}""",
        
        # Output 3: Hist format only
        """* Hist  #0: ActivityRecord{4e4099b u0 com.grofers.customerapp.staging/com.grofers.customerapp.DEFAULT t1037}""",
    ]
    
    patterns = {
        'topResumedActivity': r'topResumedActivity=ActivityRecord\{[^\s]+\s+u\d+\s+([^\s]+/[^\s]+)',
        'Hist #0': r'\*\s+Hist\s+#0:\s+ActivityRecord\{[^\s]+\s+u\d+\s+([^\s]+/[^\s]+)',
        'mCurrentFocus': r'mCurrentFocus=Window\{[^}]+\s+([^\s]+/[^\s}]+)',
    }
    
    expected_activity = "com.grofers.customerapp.staging/com.grofers.customerapp.DEFAULT"
    
    print("=" * 80)
    print("ACTIVITY PARSING FIX VERIFICATION")
    print("=" * 80)
    print()
    
    all_passed = True
    
    for i, output in enumerate(sample_outputs, 1):
        print(f"Test Case {i}:")
        print("-" * 40)
        found = False
        
        for pattern_name, pattern in patterns.items():
            match = re.search(pattern, output)
            if match:
                activity = match.group(1)
                status = "✓ PASS" if activity == expected_activity else "✗ FAIL"
                print(f"  {status} | {pattern_name:20s} | {activity}")
                found = True
                if activity != expected_activity:
                    all_passed = False
        
        if not found:
            print(f"  ✗ FAIL | No pattern matched!")
            all_passed = False
        
        print()
    
    print("=" * 80)
    if all_passed:
        print("✓ ALL TESTS PASSED - Fix should work!")
        return 0
    else:
        print("✗ SOME TESTS FAILED - Fix needs adjustment")
        return 1

if __name__ == "__main__":
    sys.exit(test_patterns())