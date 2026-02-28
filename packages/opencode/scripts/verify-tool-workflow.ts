
/**
 * Tool Workflow Verification Script
 * 
 * Verifies end-to-end tool calling functionality without requiring actual API calls.
 * Tests the transformation pipeline to ensure tools are handled correctly.
 */

import { openCodeToStitchRequest } from '../src/provider/stitch/request';
import { stitchToOpenCodeResponse } from '../src/provider/stitch/response';
import type { OpenCodeRequest, StitchResponse } from '../src/provider/stitch/types';

async function verifyToolWorkflow() {
  console.log('🔧 Verifying Tool Workflow...\n');
  
  let allTestsPassed = true;

  // Step 1: Create request with tools
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Step 1: Tools sent as native definitions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const request: OpenCodeRequest = {
    model: 'claude-3.5-sonnet',
    messages: [
      { role: 'user', content: 'What is 5 + 3?' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'calculate',
          description: 'Perform mathematical calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: 'Math expression' }
            },
            required: ['expression']
          }
        }
      }
    ],
    tool_choice: 'auto'
  };

  const stitchReq = openCodeToStitchRequest(request);

  // Verify: Tools in native format
  const hasToolsArray = stitchReq.request.tools !== undefined;
  const toolCount = stitchReq.request.tools?.length || 0;
  const toolName = stitchReq.request.tools?.[0]?.function?.name;

  console.log(`  - Tools array present: ${hasToolsArray ? '✅ Yes' : '❌ No'}`);
  console.log(`  - Tool count: ${toolCount === 1 ? '✅' : '❌'} ${toolCount}`);
  console.log(`  - Tool name: ${toolName === 'calculate' ? '✅' : '❌'} ${toolName}`);

  if (!hasToolsArray || toolCount !== 1 || toolName !== 'calculate') {
    allTestsPassed = false;
  }

  // Verify: No tools in messages
  const messageTexts = stitchReq.request.messages
    .map(m => m.content?.map(c => c.data).join(' '))
    .join(' ');
  const hasToolsInMessages = messageTexts.includes('calculate') || 
                            messageTexts.includes('function') ||
                            messageTexts.includes('parameters');

  console.log(`  - Tools NOT in messages: ${!hasToolsInMessages ? '✅ Clean (GOOD)' : '❌ Found (BAD)'}`);
  
  if (hasToolsInMessages) {
    allTestsPassed = false;
    console.log('    ⚠️  WARNING: Tool definitions found in message content!');
  }

  // Step 2: Simulate tool use response
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Step 2: Handle tool_use response');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const mockToolUseResponse: StitchResponse = {
    result: {
      response: {
        model: 'claude-3.5-sonnet',
        choices: [{
          index: 0,
          content: [{
            type: 6, // CONTENT_TYPE_TOOL_USE
            data: '',
            tool_uses: [{
              id: 'tool_abc',
              type: 'TOOL_USE_TYPE_FUNCTION',
              function: {
                name: 'calculate',
                parameters: { expression: '5 + 3' },
                result: []
              }
            }]
          }],
          finish_reason: 'FINISH_REASON_TOOL_USE'
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      }
    }
  };

  const openCodeResp = stitchToOpenCodeResponse(mockToolUseResponse);

  const hasToolCalls = openCodeResp.choices[0].message.tool_calls !== undefined;
  const toolCallId = openCodeResp.choices[0].message.tool_calls?.[0]?.id;
  const toolCallName = openCodeResp.choices[0].message.tool_calls?.[0]?.function.name;
  const finishReason = openCodeResp.choices[0].finish_reason;

  console.log(`  - Tool calls extracted: ${hasToolCalls ? '✅ Yes' : '❌ No'}`);
  console.log(`  - Tool call ID: ${toolCallId ? '✅' : '❌'} ${toolCallId}`);
  console.log(`  - Tool name: ${toolCallName === 'calculate' ? '✅' : '❌'} ${toolCallName}`);
  console.log(`  - Finish reason: ${finishReason === 'tool_calls' ? '✅' : '❌'} ${finishReason}`);

  if (!hasToolCalls || !toolCallId || toolCallName !== 'calculate' || finishReason !== 'tool_calls') {
    allTestsPassed = false;
  }

  // Step 3: Submit tool result
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Step 3: Submit tool result');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const requestWithResult: OpenCodeRequest = {
    model: 'claude-3.5-sonnet',
    messages: [
      ...request.messages,
      {
        role: 'assistant',
        content: '',
        tool_calls: openCodeResp.choices[0].message.tool_calls
      },
      {
        role: 'tool',
        tool_call_id: 'tool_abc',
        content: '{"result": 8}'
      }
    ]
  };

  const stitchReqWithResult = openCodeToStitchRequest(requestWithResult);

  const toolResultMsg = stitchReqWithResult.request.messages.find(m => 
    m.content?.some(c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT')
  );

  const hasToolResult = toolResultMsg !== undefined;
  const toolResultContent = toolResultMsg?.content?.find(
    c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT'
  );
  const isCorrectType = toolResultContent?.type === 8 || 
                       toolResultContent?.type === 'CONTENT_TYPE_TOOL_RESULT';

  console.log(`  - Tool result formatted: ${hasToolResult ? '✅ Yes' : '❌ No'}`);
  console.log(`  - Result content type: ${isCorrectType ? '✅ CONTENT_TYPE_TOOL_RESULT' : '❌ Wrong type'}`);

  if (!hasToolResult || !isCorrectType) {
    allTestsPassed = false;
  }

  // Step 4: Verify tool choice modes
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Step 4: Tool choice modes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const toolChoiceTests = [
    { choice: 'auto', expected: 1, name: 'TOOL_CHOICE_MODE_AUTO' },
    { choice: 'required', expected: 3, name: 'TOOL_CHOICE_MODE_FORCED' },
    { choice: 'none', expected: 2, name: 'TOOL_CHOICE_MODE_NONE' }
  ];

  for (const test of toolChoiceTests) {
    const req: OpenCodeRequest = {
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [{
        type: 'function',
        function: {
          name: 'test',
          parameters: { type: 'object', properties: {} }
        }
      }],
      tool_choice: test.choice as any
    };

    const stitchReq = openCodeToStitchRequest(req);
    const actual = stitchReq.request.config.tool_choice;
    const passed = actual === test.expected;

    console.log(`  - tool_choice="${test.choice}": ${passed ? '✅' : '❌'} ${test.name} (${actual})`);

    if (!passed) {
      allTestsPassed = false;
    }
  }

  // Step 5: Specific function tool choice
  const specificReq: OpenCodeRequest = {
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [{
      type: 'function',
      function: {
        name: 'get_weather',
        parameters: { type: 'object', properties: {} }
      }
    }],
    tool_choice: {
      type: 'function',
      function: { name: 'get_weather' }
    }
  };

  const specificStitchReq = openCodeToStitchRequest(specificReq);
  const specificMode = specificStitchReq.request.config.tool_choice;
  const specificFunc = specificStitchReq.request.config.tool_choice_function;
  const specificPassed = specificMode === 3 && specificFunc === 'get_weather';

  console.log(`  - tool_choice={function: "get_weather"}: ${specificPassed ? '✅' : '❌'} Mode: ${specificMode}, Function: ${specificFunc}`);

  if (!specificPassed) {
    allTestsPassed = false;
  }

  // Final summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (allTestsPassed) {
    console.log('✅ All tool workflow verifications passed!');
    console.log('   - Tools are sent as native proto definitions');
    console.log('   - Tools are NOT injected into messages');
    console.log('   - Tool use responses are correctly parsed');
    console.log('   - Tool results are properly formatted');
    console.log('   - Tool choice modes work correctly');
    console.log('\n🎉 Tool workflow is functioning correctly!');
    process.exit(0);
  } else {
    console.log('❌ Some tool workflow verifications failed!');
    console.log('   Review the output above for details.');
    console.log('\n⚠️  Tool workflow needs attention!');
    process.exit(1);
  }
}

// Run verification
verifyToolWorkflow().catch(error => {
  console.error('\n💥 Verification script failed:');
  console.error(error);
  process.exit(1);
});
