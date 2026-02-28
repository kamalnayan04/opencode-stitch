
/**
 * Tool Integration Tests - Native Tool Support
 * 
 * Comprehensive test suite to verify end-to-end tool calling functionality:
 * 1. Tools sent as native proto definitions (not injected into chat messages)
 * 2. Tool requests work correctly with stitch-backend
 * 3. Tool execution flows properly (request → tool_use → tool_result → response)
 * 4. No tools appear as chat message content
 */

import { describe, it, expect } from 'bun:test';
import {
  openCodeToStitchRequest,
  stitchToOpenCodeRequest,
} from '../request';
import {
  stitchToOpenCodeResponse,
  stitchToOpenCodeStreamDelta,
} from '../response';
import {
  transformStitchStreamChunkToOpenCodeDelta,
} from '../stream';
import type {
  OpenCodeRequest,
  StitchRequest,
  StitchResponse,
  OpenCodeResponse,
  StitchStreamChunk,
} from '../types';

describe('Tool Integration - Native Tool Support', () => {
  describe('Test 1: Tools Sent as Native Definitions', () => {
    it('should send tools as native proto ToolOption definitions', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: 'What is the weather in San Francisco?' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather in a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string', description: 'City name' },
                  unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
                },
                required: ['location']
              }
            }
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Verify tools are in request.tools (native proto format)
      expect(stitchReq.request.tools).toBeDefined();
      expect(Array.isArray(stitchReq.request.tools)).toBe(true);
      expect(stitchReq.request.tools?.length).toBe(1);
      
      const tool = stitchReq.request.tools?.[0];
      expect(tool?.type).toBeDefined(); // Should be 'function' or numeric enum
      expect(tool?.function.name).toBe('get_weather');
      expect(tool?.function.description).toBe('Get the current weather in a location');
      expect(tool?.function.parameters).toBeDefined();
      
      // Verify tools are NOT in messages (should not be prompt injection)
      const messageTexts = stitchReq.request.messages
        .map(m => m.content?.map(c => c.data).join(' '))
        .join(' ');
      
      expect(messageTexts).not.toContain('get_weather');
      expect(messageTexts).not.toContain('function');
      expect(messageTexts).not.toContain('parameters');
      expect(messageTexts).not.toContain('Current weather');
    });

    it('should NOT inject tools into system message', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the weather?' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { 
                type: 'object', 
                properties: {
                  location: { type: 'string' }
                }
              }
            }
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Check system message doesn't contain tool definitions
      const systemMsg = stitchReq.request.messages.find(
        m => m.role === 'MESSAGE_ROLE_SYSTEM'
      );
      expect(systemMsg).toBeDefined();
      
      const systemText = systemMsg?.content?.[0]?.data || '';
      expect(systemText).toBe('You are a helpful assistant.');
      expect(systemText).not.toContain('get_weather');
      expect(systemText).not.toContain('<function>');
      expect(systemText).not.toContain('tool');
    });

    it('should handle multiple tools', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: 'Help me with files and calculations' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read file contents',
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string' }
                },
                required: ['path']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'calculate',
              description: 'Perform calculations',
              parameters: {
                type: 'object',
                properties: {
                  expression: { type: 'string' }
                },
                required: ['expression']
              }
            }
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.tools).toBeDefined();
      expect(stitchReq.request.tools?.length).toBe(2);
      expect(stitchReq.request.tools?.[0]?.function.name).toBe('read_file');
      expect(stitchReq.request.tools?.[1]?.function.name).toBe('calculate');
    });
  });

  describe('Test 2: Tool Use Response Handling', () => {
    it('should extract tool_use from response content', () => {
      const stitchResp: StitchResponse = {
        result: {
          response: {
            model: 'claude-3.5-sonnet',
            choices: [{
              index: 0,
              content: [
                {
                  type: 6, // CONTENT_TYPE_TOOL_USE
                  data: '',
                  tool_uses: [{
                    id: 'tool_call_abc',
                    type: 'TOOL_USE_TYPE_FUNCTION',
                    function: {
                      name: 'get_weather',
                      parameters: { location: 'San Francisco', unit: 'celsius' },
                      result: []
                    }
                  }]
                }
              ],
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

      const openCodeResp = stitchToOpenCodeResponse(stitchResp);

      // Verify tool_use is extracted to tool_calls
      expect(openCodeResp.choices[0].message.tool_calls).toBeDefined();
      expect(openCodeResp.choices[0].message.tool_calls?.length).toBe(1);
      
      const toolCall = openCodeResp.choices[0].message.tool_calls?.[0];
      expect(toolCall?.id).toBe('tool_call_abc');
      expect(toolCall?.type).toBe('function');
      expect(toolCall?.function.name).toBe('get_weather');
      
      const args = JSON.parse(toolCall?.function.arguments || '{}');
      expect(args.location).toBe('San Francisco');
      expect(args.unit).toBe('celsius');
      
      // Verify finish reason is set correctly
      expect(openCodeResp.choices[0].finish_reason).toBe('tool_calls');
    });

    it('should handle tool_use in streaming responses', () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 6, // CONTENT_TYPE_TOOL_USE
                  data: '',
                  tool_uses: [{
                    id: 'tool_call_abc',
                    type: 'TOOL_USE_TYPE_FUNCTION',
                    function: {
                      name: 'get_weather',
                      parameters: {},
                      result: []
                    }
                  }]
                }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  type: 6,
                  data: '',
                  tool_uses: [{
                    id: 'tool_call_abc',
                    type: 'TOOL_USE_TYPE_FUNCTION',
                    function: {
                      name: 'get_weather',
                      parameters: { location: 'San Francisco' },
                      result: []
                    }
                  }]
                }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_TOOL_USE'
              }]
            }
          }
        }
      ];

      const events = chunks.map(chunk => 
        transformStitchStreamChunkToOpenCodeDelta(chunk)
      ).filter(e => e !== null);

      // Find the event with tool_calls
      const toolEvent = events.find(e => e?.choices?.[0]?.delta?.tool_calls);
      expect(toolEvent).toBeDefined();
      expect(toolEvent?.choices[0].delta.tool_calls?.[0].function?.name).toBe('get_weather');
    });

    it('should handle multiple tool uses in single response', () => {
      const stitchResp: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [
                {
                  type: 6,
                  data: '',
                  tool_uses: [
                    {
                      id: 'tool_1',
                      type: 'TOOL_USE_TYPE_FUNCTION',
                      function: {
                        name: 'read_file',
                        parameters: { path: 'test.txt' },
                        result: []
                      }
                    },
                    {
                      id: 'tool_2',
                      type: 'TOOL_USE_TYPE_FUNCTION',
                      function: {
                        name: 'calculate',
                        parameters: { expression: '5 + 3' },
                        result: []
                      }
                    }
                  ]
                }
              ],
              finish_reason: 'FINISH_REASON_TOOL_USE'
            }]
          }
        }
      };

      const openCodeResp = stitchToOpenCodeResponse(stitchResp);

      expect(openCodeResp.choices[0].message.tool_calls?.length).toBe(2);
      expect(openCodeResp.choices[0].message.tool_calls?.[0].function.name).toBe('read_file');
      expect(openCodeResp.choices[0].message.tool_calls?.[1].function.name).toBe('calculate');
    });
  });

  describe('Test 3: Tool Result Submission', () => {
    it('should format tool results correctly', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool_call_abc',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"San Francisco"}'
                }
              }
            ]
          },
          {
            role: 'tool',
            tool_call_id: 'tool_call_abc',
            content: '{"temperature": 72, "condition": "sunny"}'
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Find the tool result message
      const toolResultMsg = stitchReq.request.messages.find(m => 
        m.content?.some(c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT')
      );

      expect(toolResultMsg).toBeDefined();
      
      const toolResult = toolResultMsg?.content.find(
        c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT'
      );
      
      expect(toolResult).toBeDefined();
      expect(toolResult?.tool_result).toBeDefined();
      expect(toolResult?.tool_result?.[0]?.id).toBe('tool_call_abc');
      expect(toolResult?.tool_result?.[0]?.function?.result?.[0]?.data).toContain('72');
    });

    it('should handle tool errors correctly', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          {
            role: 'tool',
            tool_call_id: 'tool_call_abc',
            content: 'Error: API timeout',
            is_error: true
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      const toolResultMsg = stitchReq.request.messages.find(m => 
        m.content?.some(c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT')
      );

      expect(toolResultMsg).toBeDefined();
      
      const toolResult = toolResultMsg?.content.find(
        c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT'
      );
      
      expect(toolResult?.tool_result?.[0]?.is_failed).toBe(true);
    });

    it('should handle multiple tool results', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool_1',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"a.txt"}' }
              },
              {
                id: 'tool_2',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"b.txt"}' }
              }
            ]
          },
          {
            role: 'tool',
            tool_call_id: 'tool_1',
            content: 'Content of a.txt'
          },
          {
            role: 'tool',
            tool_call_id: 'tool_2',
            content: 'Content of b.txt'
          }
        ]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      const toolResultMsgs = stitchReq.request.messages.filter(m => 
        m.content?.some(c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT')
      );

      expect(toolResultMsgs.length).toBeGreaterThan(0);
    });
  });

  describe('Test 4: Tool Choice Control', () => {
    it('should support tool_choice: "auto"', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ 
          type: 'function', 
          function: { 
            name: 'test', 
            parameters: { type: 'object', properties: {} } 
          } 
        }],
        tool_choice: 'auto'
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // TOOL_CHOICE_MODE_AUTO = 1
      expect(stitchReq.request.config.tool_choice).toBe(1);
    });

    it('should support tool_choice: "required"', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ 
          type: 'function', 
          function: { 
            name: 'test', 
            parameters: { type: 'object', properties: {} } 
          } 
        }],
        tool_choice: 'required'
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // TOOL_CHOICE_MODE_FORCED = 3
      expect(stitchReq.request.config.tool_choice).toBe(3);
    });

    it('should support tool_choice: {type: "function", function: {name: "specific"}}', () => {
      const openCodeReq: OpenCodeRequest = {
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

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // TOOL_CHOICE_MODE_FORCED = 3
      expect(stitchReq.request.config.tool_choice).toBe(3);
      expect(stitchReq.request.config.tool_choice_function).toBe('get_weather');
    });

    it('should support tool_choice: "none"', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ 
          type: 'function', 
          function: { 
            name: 'test', 
            parameters: { type: 'object', properties: {} } 
          } 
        }],
        tool_choice: 'none'
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // TOOL_CHOICE_MODE_NONE = 2
      expect(stitchReq.request.config.tool_choice).toBe(2);
    });
  });

  describe('Test 5: End-to-End Tool Workflow', () => {
    it('should handle complete tool call workflow', () => {
      // Step 1: Initial request with tools
      const initialReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: 'What is 5 + 3?' }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'calculate',
            description: 'Perform mathematical calculations',
            parameters: {
              type: 'object',
              properties: {
                expression: { type: 'string' }
              },
              required: ['expression']
            }
          }
        }]
      };

      const stitchReq1 = openCodeToStitchRequest(initialReq);
      
      // Verify tools are present
      expect(stitchReq1.request.tools).toBeDefined();
      expect(stitchReq1.request.tools?.[0]?.function.name).toBe('calculate');

      // Step 2: Simulate tool use response
      const toolUseResp: StitchResponse = {
        result: {
          response: {
            model: 'claude-3.5-sonnet',
            choices: [{
              index: 0,
              content: [{
                type: 6,
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
            }]
          }
        }
      };

      const openCodeResp1 = stitchToOpenCodeResponse(toolUseResp);
      
      // Verify tool call extracted
      expect(openCodeResp1.choices[0].message.tool_calls).toBeDefined();
      expect(openCodeResp1.choices[0].finish_reason).toBe('tool_calls');

      // Step 3: Submit tool result
      const toolResultReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          ...initialReq.messages,
          openCodeResp1.choices[0].message,
          {
            role: 'tool',
            tool_call_id: openCodeResp1.choices[0].message.tool_calls![0].id,
            content: '{"result": 8}'
          }
        ]
      };

      const stitchReq2 = openCodeToStitchRequest(toolResultReq);
      
      // Verify tool result is formatted correctly
      const toolResultMsg = stitchReq2.request.messages.find(m => 
        m.content?.some(c => c.type === 8 || c.type === 'CONTENT_TYPE_TOOL_RESULT')
      );
      
      expect(toolResultMsg).toBeDefined();

      // Step 4: Simulate final response
      const finalResp: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'The answer is 8.'
              }],
              finish_reason: 'FINISH_REASON_STOP'
            }]
          }
        }
      };

      const openCodeResp2 = stitchToOpenCodeResponse(finalResp);
      
      expect(openCodeResp2.choices[0].message.content).toBe('The answer is 8.');
      expect(openCodeResp2.choices[0].finish_reason).toBe('stop');
    });
  });
});
