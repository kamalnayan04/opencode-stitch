/**
 * Stitch Native Provider Implementation
 * * Native implementation of Vercel AI SDK v5 LanguageModelV2 and ProviderV1 interfaces
 * for the Stitch backend.
 * * Key Features:
 * - Native tool schemas via Gemini-compatible tools array
 * - Dual-mode parser handles both native JSON and strict Anthropic XML tool calls
 * - Impenetrable XML stream buffering (Zero UI Leakage)
 * - Native NDJSON → AI SDK event streaming
 */

// ============================================================================
// SAFE DELTA POLYFILL FOR OPENCODE CONSUMER
// OpenCode's backend SSE formatter expects `chunk.delta` for text-delta events,
// but Vercel AI SDK v5 strips it and outputs `textDelta` (or `text`).
// 
// Strategy: JSON.parse hook for deserialized objects + ensureDelta() helper
// for natively constructed stream events. NO Object.prototype mutation.
// ============================================================================

// 1. Hook JSON.parse to inject enumerable 'delta' field during Vercel internal parsing.
if (typeof JSON !== 'undefined' && !(JSON.parse as any).__opencode_patched) {
  const originalParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const result = originalParse.call(JSON, text, reviver);
    if (result && typeof result === 'object') {
      if (result.type === 'text-delta' && !result.delta) {
        result.delta = result.textDelta || result.text || '';
      }
    }
    return result;
  };
  (JSON.parse as any).__opencode_patched = true;
}

// 2. Safe helper to inject 'delta' on individual text-delta stream events
// (replaces the dangerous Object.prototype mutation)
function ensureDelta(event: any): any {
  if (event && typeof event === 'object' && event.type === 'text-delta' && !('delta' in event)) {
    event.delta = event.textDelta || event.text || '';
  }
  return event;
}

import { debugLogger } from './debug-logger';
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  ProviderV1
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  generateId,
  postJsonToApi,
  type FetchFunction
} from '@ai-sdk/provider-utils';
import { logger } from '../../shared/logger';
import { flowLogger } from '../../shared/debug-logger';
import type {
  StitchConfig,
  StitchProviderSettings,
  StitchModelId,
  StitchApiRequest,
  StitchApiResponse
} from './provider-types';
import { mapToolName, mapArguments } from './tool-mapping';
import { UniversalXmlParser, KNOWN_TOOLS } from './state-machine-parser';

// KNOWN_TOOLS is imported from state-machine-parser.ts (single source of truth)

function unescapeXml(unsafe: string) {
  return unsafe
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// UniversalXmlParser is imported from state-machine-parser.ts (single source of truth)

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BASE_URL = process.env.STITCH_API_URL || 'https://api.stitch.tech/v1';
const STREAM_ENDPOINT = '/stream-chat-completion';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;
const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 1 * 1024 * 1024; // 1MB

// ============================================================================
// MODEL ROUTING
// ============================================================================

function routeModel(modelId: string): string {
  const modelMappings: Record<string, string> = {
    'stitch-1': 'claude-4-5-sonnet',
    'stitch-2': 'claude-4-5-sonnet',
    'antigravity-gemini-3-flash': 'claude-4-5-sonnet',
    'antigravity-gemini-2-flash': 'claude-4-5-sonnet',
    'antigravity-gemini-flash': 'claude-4-5-sonnet',
    'antigravity-gemini-flash-thinking': 'claude-4-5-sonnet',
    'antigravity-gemini-thinking': 'claude-4-5-sonnet',
    'antigravity-gemini-2-flash-thinking': 'claude-4-5-sonnet',
  };
  return modelMappings[modelId] || modelId;
}

function mapFinishReason(stitchReason: string | undefined): LanguageModelV2FinishReason {
  if (!stitchReason) return 'unknown';
  const reasonMap: Record<string, LanguageModelV2FinishReason> = {
    'FINISH_REASON_STOP': 'stop',
    'FINISH_REASON_MAX_TOKENS': 'length',
    'FINISH_REASON_SAFETY': 'content-filter',
    'FINISH_REASON_RECITATION': 'content-filter',
    'FINISH_REASON_FUNCTION_CALL': 'tool-calls',
    'FINISH_REASON_TOOL_CALLS': 'tool-calls',
    'STOP': 'stop',
    'MAX_TOKENS': 'length',
    'SAFETY': 'content-filter',
    'FUNCTION_CALL': 'tool-calls',
    'tool_calls': 'tool-calls',
    'TOOL_CALLS': 'tool-calls',
    'stop': 'stop',
    'end_turn': 'stop',
    'length': 'length',
    'max_tokens': 'length',
    'content_filter': 'content-filter',
  };
  return reasonMap[stitchReason] || 'unknown';
}

// ============================================================================
// NATIVE SCHEMA CONVERSION FUNCTIONS
// ============================================================================

function convertToolsToStitchSchema(tools: LanguageModelV2CallOptions['tools']) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(tool => ({
    functionDeclaration: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || {}
    }
  }));
}

function extractSystemInstruction(messages: LanguageModelV2CallOptions['prompt']): string | undefined {
  const systemMessages = messages
    .filter(m => m.role === 'system')
    .map(m => {
      if (typeof m.content === 'string') {
        return m.content;
      }
      return m.content
        .map(p => p.type === 'text' ? p.text : '')
        .join('\n');
    })
    .filter(Boolean);

  if (systemMessages.length === 0) return undefined;
  return systemMessages.join('\n\n');
}

// ============================================================================
// MESSAGE CONVERSION
// ============================================================================

function convertMessages(messages: LanguageModelV2CallOptions['prompt']): StitchApiRequest['request']['messages'] {
  const stitchMessages: StitchApiRequest['request']['messages'] = [];

  for (const message of messages) {
    if (message.role === 'system') continue;
    let content = '';

    if (message.role === 'tool') {
      content = message.content.map(part => {
        if (part.type === 'tool-result') {
          let val = part.output && 'value' in part.output ? part.output.value : (part as any).result;
          const resultStr = typeof val === 'string' ? val : JSON.stringify(val);
          return `<tool_result name="${part.toolName}">\n${resultStr}\n</tool_result>`;
        }
        return '';
      }).filter(Boolean).join('\n\n');

      if (!content || content.trim() === '') continue;
      stitchMessages.push({ role: 'MESSAGE_ROLE_USER', content: [{ type: 'CONTENT_TYPE_TEXT', data: content }] });
      continue;
    }

    if (typeof message.content === 'string') {
      content = message.content;
    } else {
      content = message.content.map(part => {
        if (part.type === 'text') return part.text;
        if (part.type === 'image') return '[Image content]';
        if (part.type === 'tool-call') {
          try {
            const rawArgs = (part as any).args || (part as any).input || '{}';
            const argsObj = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
            let xml = `<function_calls>\n<invoke name="${part.toolName}">\n`;
            for (const [k, v] of Object.entries(argsObj || {})) {
              if (v === undefined || v === null) continue;
              xml += `  <parameter name="${k}">${typeof v === 'string' ? v : JSON.stringify(v)}</parameter>\n`;
            }
            xml += `</invoke>\n</function_calls>`;
            return xml;
          } catch (e) {
            return `<function_calls>\n<invoke name="${part.toolName}" />\n</function_calls>`;
          }
        }
        return '';
      }).filter(Boolean).join('\n');
    }

    if (!content || content.trim() === '') continue;
    const role = message.role === 'user' ? 'MESSAGE_ROLE_USER' : 'MESSAGE_ROLE_ASSISTANT';
    stitchMessages.push({ role, content: [{ type: 'CONTENT_TYPE_TEXT', data: content }] });
  }

  const validatedMessages = stitchMessages.filter(msg => msg.content.some(c => c.data && c.data.trim() !== ''));
  const collapsedMessages: StitchApiRequest['request']['messages'] = [];

  for (const msg of validatedMessages) {
    if (collapsedMessages.length > 0 && collapsedMessages[collapsedMessages.length - 1].role === msg.role) {
      collapsedMessages[collapsedMessages.length - 1].content[0].data += '\n\n' + msg.content[0].data;
    } else {
      collapsedMessages.push(msg);
    }
  }
  return collapsedMessages;
}

// ============================================================================
// STITCH LANGUAGE MODEL
// ============================================================================

export class StitchLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'stitch';
  readonly modelId: StitchModelId;
  private readonly config: StitchConfig;

  constructor(modelId: StitchModelId, config: StitchConfig) {
    this.modelId = modelId;
    this.config = config;

    setTimeout(() => {
      try {
        const idx = require('./index');
        if (idx && idx.STITCH_PROVIDER_METADATA) {
          (idx.STITCH_PROVIDER_METADATA as any).outputFormat = 'native-ai-sdk';
        }
      } catch (e) { }
    }, 50);
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<any> {
    const startTime = Date.now();
    const warnings: LanguageModelV2CallWarning[] = [];
    const systemInstruction = extractSystemInstruction(options.prompt);
    const messages = convertMessages(options.prompt);
    const nativeTools = convertToolsToStitchSchema(options.tools);
    const stitchModel = routeModel(this.modelId);

    const body: StitchApiRequest = {
      request: {
        model: stitchModel,
        fallback_model: stitchModel,
        ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
        ...(nativeTools && { tools: nativeTools }),
        messages,
        config: { temperature: options.temperature ?? DEFAULT_TEMPERATURE, max_tokens: (options as any).maxTokens ?? DEFAULT_MAX_TOKENS },
        client_options: { source: 'opencode', retry_options: { max_retries: 0 }, request_options: { content_type: 'application/json', timeout_ms: this.config.timeout || DEFAULT_TIMEOUT } }
      }
    };

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL || DEFAULT_BASE_URL}${STREAM_ENDPOINT}`,
      headers: combineHeaders(
        {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
          'Grpc-Metadata-x-project-name': 'stitch',
          'Grpc-Metadata-x-project-auth-key': 'stitch_prod_dorp_x7plq9',
          'X-Opencode-Client': 'opencode-native-provider/2.0.0',
          'User-Agent': 'opencode/local'
        },
        this.config.headers
      ),
      body,
      failedResponseHandler: createJsonResponseHandler({ errorSchema: (error: unknown) => ({ error }), errorToMessage: (error: unknown) => JSON.stringify(error) }),
      successfulResponseHandler: createJsonResponseHandler({ responseSchema: (response: unknown) => response as StitchApiResponse }),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });

    const duration = Date.now() - startTime;
    const status = response.result?.response?.status as any;
    if (status && status.code && status.code !== 'RESPONSE_CODE_OK' && status.code !== 'RESPONSE_CODE_SUCCESS') {
      throw new Error(`Stitch API error [${status.code}]: ${status.message || 'Unknown API error'}`);
    }

    const choices = response.result?.response?.choices;
    if (!choices || choices.length === 0) throw new Error('Stitch API returned empty choices array');

    const choice = choices[0];
    let toolCalls: any[] | undefined;
    let text = '';

    const nativeFunctionCall = choice.content?.[0]?.functionCall;
    if (nativeFunctionCall) {
      toolCalls = [{ toolCallType: 'function', toolCallId: generateId(), toolName: nativeFunctionCall.name, args: JSON.stringify(nativeFunctionCall.args || {}) }];
    } else {
      const contentText = choice.content?.[0]?.data || '';
      if (contentText) {
        const parser = new UniversalXmlParser();
        const parsed = parser.parseStreamChunk(contentText);
        const flushed = parser.flush();

        const allToolCalls = [...parsed.toolCalls, ...flushed.toolCalls];
        if (allToolCalls.length > 0) {
          toolCalls = allToolCalls.map(tc => ({ toolCallType: 'function', toolCallId: tc.id || generateId(), toolName: tc.toolName || 'unknown', args: tc.args }));
        }
        text = parsed.content + flushed.content;
      }
    }

    return {
      text: text || undefined,
      toolCalls,
      finishReason: mapFinishReason(choice.finish_reason),
      usage: { promptTokens: response.result.response.usage?.prompt_tokens || 0, completionTokens: response.result.response.usage?.completion_tokens || 0 },
      rawCall: { rawPrompt: body, rawSettings: options },
      rawResponse: { headers: responseHeaders }
    };
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<any> {
    const startTime = Date.now();
    const warnings: LanguageModelV2CallWarning[] = [];
    const systemInstruction = extractSystemInstruction(options.prompt);
    const messages = convertMessages(options.prompt);
    const nativeTools = convertToolsToStitchSchema(options.tools);
    const stitchModel = routeModel(this.modelId);

    const body: StitchApiRequest = {
      request: {
        model: stitchModel,
        fallback_model: stitchModel,
        ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
        ...(nativeTools && { tools: nativeTools }),
        messages,
        config: { temperature: options.temperature ?? DEFAULT_TEMPERATURE, max_tokens: (options as any).maxTokens ?? DEFAULT_MAX_TOKENS },
        client_options: { source: 'opencode', retry_options: { max_retries: 0 }, request_options: { content_type: 'application/json', timeout_ms: this.config.timeout || DEFAULT_TIMEOUT } }
      }
    };

    const requestUrl = `${this.config.baseURL || DEFAULT_BASE_URL}${STREAM_ENDPOINT}`;
    const requestHeaders: Record<string, string> = combineHeaders(
      {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        'Grpc-Metadata-x-project-name': 'stitch',
        'Grpc-Metadata-x-project-auth-key': 'stitch_prod_dorp_x7plq9',
        'X-Opencode-Client': 'opencode-native-provider/2.0.0',
        'User-Agent': 'opencode/local'
      },
      this.config.headers as Record<string, string> | undefined
    ) as Record<string, string>;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders as any,
      body: JSON.stringify(body),
      signal: options.abortSignal
    } as any);

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    if (!response.body) throw new Error('Response has no body stream');

    const responseHeadersRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeadersRecord[key] = value; });

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const parser = new UniversalXmlParser();
        let buffer = '';
        let lastActivity = Date.now();
        let isActiveText = false;
        let finishEmitted = false;

        const timeoutCheck = setInterval(() => {
          if (Date.now() - lastActivity > STREAM_TIMEOUT_MS) {
            controller.error(new Error(`Stream timeout after ${STREAM_TIMEOUT_MS}ms of inactivity`));
            clearInterval(timeoutCheck);
          }
        }, 10000);

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              clearInterval(timeoutCheck);

              const finalFlush = parser.flush();
              if (finalFlush.content) {
                if (!isActiveText) { controller.enqueue({ type: 'text-start', id: 'txt-0' }); isActiveText = true; }
                controller.enqueue({ type: 'text-delta', id: 'txt-0', textDelta: finalFlush.content, text: finalFlush.content, delta: finalFlush.content } as any);
              }

              if (finalFlush.toolCalls && finalFlush.toolCalls.length > 0) {
                for (const toolCall of finalFlush.toolCalls) {
                  const id = toolCall.id || generateId();
                  const name = toolCall.toolName || 'unknown';
                  const inputArgs = toolCall.args || '{}';
                  debugLogger.withCorrelationId('tool-emit-flush').info('🔍 TOOL-CALL EMIT (flush)', { toolName: name, inputArgs, inputType: typeof inputArgs });
                  controller.enqueue({ type: 'tool-input-start', id, toolName: name } as any);
                  controller.enqueue({ type: 'tool-input-delta', id, delta: inputArgs } as any);
                  controller.enqueue({ type: 'tool-input-end', id } as any);
                  controller.enqueue({ type: 'tool-call', toolCallId: id, toolName: name, input: inputArgs, providerExecuted: false } as any);
                }
              }

              if (isActiveText) controller.enqueue({ type: 'text-end', id: 'txt-0' });
              if (!finishEmitted) controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } as any });

              controller.close();
              break;
            }

            lastActivity = Date.now();
            buffer += decoder.decode(value, { stream: true });

            if (buffer.length > MAX_BUFFER_SIZE) {
              clearInterval(timeoutCheck);
              controller.error(new Error(`Buffer overflow`));
              break;
            }

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (let line of lines) {
              if (line.startsWith('data: ')) line = line.substring(6);
              line = line.trim();
              if (!line || line === '[DONE]') continue;

              try {
                const res = JSON.parse(line);
                let content: string | undefined;
                let finishReason: string | undefined;
                let usage: any;
                let rawTextChunk = '';

                if (res.type === 'content_block_delta' && res.delta?.type === 'text_delta') {
                  rawTextChunk = res.delta.text;
                }
                if (res.type === 'message_delta' && res.delta?.stop_reason) {
                  finishReason = res.delta.stop_reason;
                  usage = res.usage;
                } else if (res.choices && res.choices.length > 0) {
                  rawTextChunk = res.choices[0].delta?.content || '';
                  finishReason = res.choices[0].finish_reason;
                } else if (res.result?.response?.choices && res.result.response.choices.length > 0) {
                  const choice = res.result.response.choices[0];
                  finishReason = choice.finish_reason;
                  usage = res.result.response.usage;

                  const nativeFunctionCall = choice.content?.[0]?.functionCall;
                  if (nativeFunctionCall) {
                    const id = generateId();
                    const rawName = nativeFunctionCall.name || 'unknown';
                    const name = mapToolName(rawName);
                    const rawArgs = typeof nativeFunctionCall.args === 'string'
                      ? (nativeFunctionCall.args ? JSON.parse(nativeFunctionCall.args) : {})
                      : (nativeFunctionCall.args || {});

                    const inputArgsObj = mapArguments(rawName, rawArgs);
                    const inputArgs = JSON.stringify(inputArgsObj);
                    debugLogger.withCorrelationId('tool-emit-native').info('🔍 TOOL-CALL EMIT (native)', { toolName: name, rawName, rawArgs, inputArgsObj, inputArgs, inputType: typeof inputArgs });

                    controller.enqueue({ type: 'tool-input-start', id, toolName: name } as any);
                    controller.enqueue({ type: 'tool-input-delta', id, delta: inputArgs } as any);
                    controller.enqueue({ type: 'tool-input-end', id } as any);
                    controller.enqueue({ type: 'tool-call', toolCallId: id, toolName: name, input: inputArgs, providerExecuted: false } as any);
                    finishReason = 'tool_calls';
                    continue;
                  }
                  rawTextChunk = choice.content?.[0]?.data || '';
                }

                if (rawTextChunk) {
                  const result = parser.parseStreamChunk(rawTextChunk);
                  content = result.content;
                  if (result.toolCalls && result.toolCalls.length > 0) {
                    for (const toolCall of result.toolCalls) {
                      const id = toolCall.id || generateId();
                      const name = toolCall.toolName || 'unknown';
                      const inputArgs = toolCall.args || '{}';
                      debugLogger.withCorrelationId('tool-emit-stream').info('🔍 TOOL-CALL EMIT (stream)', { toolName: name, inputArgs, inputType: typeof inputArgs, rawToolCall: JSON.stringify(toolCall) });
                      controller.enqueue({ type: 'tool-input-start', id, toolName: name } as any);
                      controller.enqueue({ type: 'tool-input-delta', id, delta: inputArgs } as any);
                      controller.enqueue({ type: 'tool-input-end', id } as any);
                      controller.enqueue({ type: 'tool-call', toolCallId: id, toolName: name, input: inputArgs, providerExecuted: false } as any);
                    }
                    finishReason = 'tool_calls';
                  }
                }

                if (content && content !== '') {
                  if (!isActiveText) { controller.enqueue({ type: 'text-start', id: 'txt-0' }); isActiveText = true; }
                  controller.enqueue({ type: 'text-delta', id: 'txt-0', textDelta: content, text: content, delta: content } as any);
                  await new Promise(resolve => setTimeout(resolve, 0));
                }

                if ((finishReason || usage) && !finishEmitted) {
                  if (isActiveText) { controller.enqueue({ type: 'text-end', id: 'txt-0' }); isActiveText = false; }
                  controller.enqueue({ type: 'finish', finishReason: finishReason ? mapFinishReason(finishReason) : 'stop', usage: { promptTokens: usage?.prompt_tokens || 0, completionTokens: usage?.completion_tokens || 0 } as any });
                  finishEmitted = true;
                }
              } catch (e: any) {
                if (e.message && e.message.includes('Controller is already closed')) return;
              }
            }
          }
        } catch (error) {
          clearInterval(timeoutCheck);
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });

    return { stream, rawCall: { rawPrompt: body, rawSettings: options }, rawResponse: { headers: responseHeadersRecord }, warnings };
  }
}

export class StitchProvider implements ProviderV2 {
  readonly languageModel: (modelId: StitchModelId) => LanguageModelV2;
  constructor(options: StitchProviderSettings = {}) {
    const config: StitchConfig = { baseURL: options.baseURL, apiKey: options.apiKey, headers: options.headers, fetch: options.fetch, timeout: options.timeout };
    this.languageModel = (modelId: StitchModelId) => new StitchLanguageModel(modelId, config);
  }
}

export function createStitch(options: StitchProviderSettings = {}): StitchProvider {
  return new StitchProvider(options);
}