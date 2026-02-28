
/**
 * Stitch Tool Injection Module
 * 
 * DEPRECATED: This module is kept for backwards compatibility only.
 * The new native schema architecture uses native tools array and systemInstruction field.
 * 
 * @deprecated Use native schema conversion instead (see provider.ts: convertToolsToStitchSchema, extractSystemInstruction)
 */

import type { LanguageModelV2CallOptions } from '@ai-sdk/provider';

/**
 * Serialize AI SDK tools to compact JSON format
 * 
 * @param tools - Array of tools from AI SDK options
 * @returns Compact JSON string with tool schemas
 * @deprecated Use convertToolsToStitchSchema in provider.ts instead
 */
export function serializeTools(tools: LanguageModelV2CallOptions['tools']): string {
  if (!tools || tools.length === 0) {
    return '';
  }

  const toolSchemas = tools
    .filter(tool => tool.type === 'function')
    .map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || {}
    }));

  return JSON.stringify({ tools: toolSchemas });
}

/**
 * Create strict JSON formatting instructions for the model
 * 
 * @returns Instruction text explaining JSON tool call format
 * @deprecated No longer needed with native schema
 */
export function createToolInstructions(): string {
  return ``;
}

/**
 * Inject tool schemas into the first user message
 * 
 * @param messages - Array of conversation messages
 * @param tools - Array of tools to inject
 * @returns Modified messages array with tool schemas injected
 * @deprecated Use native tools array in request instead
 */
export function injectToolsIntoPrompt(
  messages: Array<{ role: string; content: string | any[] }>,
  tools: LanguageModelV2CallOptions['tools']
): Array<{ role: string; content: string | any[] }> {
  if (!tools || tools.length === 0) {
    return messages;
  }

  const toolSchemas = serializeTools(tools);
  const instructions = createToolInstructions();

  // Find the first user message
  const firstUserIndex = messages.findIndex(m => m.role === 'user');
  
  if (firstUserIndex === -1) {
    // No user message found, add one at the end
    return [
      ...messages,
      {
        role: 'user',
        content: `${instructions}\n\nAvailable tools:\n${toolSchemas}`
      }
    ];
  }

  // Inject into first user message
  const firstUserMessage = messages[firstUserIndex];
  const originalContent = typeof firstUserMessage.content === 'string'
    ? firstUserMessage.content
    : JSON.stringify(firstUserMessage.content);

  const modifiedMessages = [...messages];
  modifiedMessages[firstUserIndex] = {
    ...firstUserMessage,
    content: `${instructions}\n\nAvailable tools:\n${toolSchemas}\n\n${originalContent}`
  };

  return modifiedMessages;
}

/**
 * Extract tool schemas from injected prompt
 * (Used for debugging/validation)
 * 
 * @param content - Message content that may contain tool schemas
 * @returns Extracted tool schemas or null
 * @deprecated No longer needed with native schema
 */
export function extractToolSchemas(content: string): any | null {
  const toolsMatch = content.match(/\{"tools":\[.*?\]\}/s);
  if (!toolsMatch) {
    return null;
  }

  try {
    return JSON.parse(toolsMatch[0]);
  } catch {
    return null;
  }
}
