import { mapToolName, mapArguments, TOOL_NAME_MAPPING } from './tool-mapping';

export const KNOWN_TOOLS = Array.from(new Set([
  ...Object.keys(TOOL_NAME_MAPPING),
  'explore', 'grep', 'read', 'write', 'write_file', 'edit', 'bash',
  'question', 'glob', 'task', 'webfetch', 'todowrite', 'skill', 'ast_grep',
  'mcp_read_file', 'mcp_search_files', 'mcp_list_directory',
  'sed', 'replace', 'str_replace', 'str_replace_editor', 'find_and_replace',
  'multi_edit', 'multiedit', 'batch_edit',
  'apply_patch', 'patch',
  'cat', 'view', 'view_file',
  'execute', 'execute_command', 'command-execute', 'command', 'shell',
  'background_launch_agent', 'ast_grep_search', 'session_info', 'background_output',
  'search', 'search_files', 'file-search', 'file-read', 'file-write', 'file-edit', 'file-list',
]));

function unescapeXml(unsafe: string) {
  return unsafe
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ============================================================================
// UNIVERSAL XML PARSER
// Impenetrable buffering. Intercepts <invoke> and <tool_name> tags.
// ============================================================================
export class UniversalXmlParser {
  private buffer = '';
  private toolCallIdCounter = 0;

  parseStreamChunk(text: string) {
    this.buffer += text;
    let content = '';
    const toolCalls: Array<{ id: string, toolName: string, args: string }> = [];

    let processing = true;
    while (processing) {
      processing = false;

      let earliestStart = -1;
      let matchedTool = '';
      let isInvoke = false;
      let openTagFull = '';

      // 1. Check Anthropic's <invoke name="..."> format
      const invokeRegex = /<invoke\s+name="([^"]+)"[^>]*>/g;
      let invokeMatch = invokeRegex.exec(this.buffer);
      if (invokeMatch) {
        earliestStart = invokeMatch.index;
        matchedTool = invokeMatch[1];
        isInvoke = true;
        openTagFull = invokeMatch[0];
      }

      // 2. Check direct tool tags (e.g., <write_file>, <bash>)
      const directRegex = new RegExp(`<(${KNOWN_TOOLS.join('|')})(?:\\s+[^>]*)?>`, 'g');
      let directMatch = directRegex.exec(this.buffer);
      if (directMatch) {
        if (earliestStart === -1 || directMatch.index < earliestStart) {
          earliestStart = directMatch.index;
          matchedTool = directMatch[1];
          isInvoke = false;
          openTagFull = directMatch[0];
        }
      }

      if (earliestStart !== -1) {
        const closeTag = isInvoke ? `</invoke>` : `</${matchedTool}>`;
        const closeIndex = this.buffer.indexOf(closeTag, earliestStart + openTagFull.length);

        if (closeIndex !== -1) {
          // TAG IS CLOSED. Extract it perfectly.
          const fullXml = this.buffer.substring(earliestStart, closeIndex + closeTag.length);

          content += this.buffer.substring(0, earliestStart);
          this.buffer = this.buffer.substring(closeIndex + closeTag.length);

          const rawArgs = this.extractArgs(fullXml, openTagFull, closeTag, matchedTool, isInvoke);

          toolCalls.push({
            id: `call_${Date.now()}_${this.toolCallIdCounter++}`,
            toolName: mapToolName(matchedTool),
            args: JSON.stringify(mapArguments(matchedTool, rawArgs))
          });

          processing = true;
          continue;
        }
      }
    }

    // 3. Impenetrable Hold-Back Logic (Quarantine Partial Tags)
    let holdIndex = -1;

    const invokeRegex2 = /<invoke\s+name="([^"]+)"[^>]*>/g;
    let invokeMatch2 = invokeRegex2.exec(this.buffer);
    if (invokeMatch2) holdIndex = invokeMatch2.index;

    const directRegex2 = new RegExp(`<(${KNOWN_TOOLS.join('|')})(?:\\s+[^>]*)?>`, 'g');
    let directMatch2 = directRegex2.exec(this.buffer);
    if (directMatch2 && (holdIndex === -1 || directMatch2.index < holdIndex)) {
      holdIndex = directMatch2.index;
    }

    // Check for deeply partial tags at the end of the buffer (e.g. "<writ")
    if (holdIndex === -1) {
      const lastOpen = this.buffer.lastIndexOf('<');
      if (lastOpen !== -1) {
        const partial = this.buffer.substring(lastOpen);
        const isPartialKnown = KNOWN_TOOLS.some(t =>
          `<${t}`.startsWith(partial) || partial.startsWith(`<${t}`) ||
          `</${t}>`.startsWith(partial) || partial.startsWith(`</${t}`)
        );
        if ('<invoke'.startsWith(partial) || partial.startsWith('<invoke') ||
          '</invoke>'.startsWith(partial) || partial.startsWith('</invoke>') ||
          '<function_calls>'.startsWith(partial) || partial.startsWith('<function_calls') ||
          '</function_calls>'.startsWith(partial) || partial.startsWith('</function_calls') ||
          isPartialKnown) {
          holdIndex = lastOpen;
        }
      }
    }

    let contentToEmit = '';
    if (holdIndex !== -1) {
      contentToEmit = content + this.buffer.substring(0, holdIndex);
      this.buffer = this.buffer.substring(holdIndex);
    } else {
      contentToEmit = content + this.buffer;
      this.buffer = '';
    }

    // Strip generic Anthropic wrappers from the emitted text
    contentToEmit = contentToEmit.replace(/<\/?function_calls>/g, '');

    return { content: contentToEmit, toolCalls };
  }

  flush() {
    let content = '';
    const toolCalls: Array<{ id: string, toolName: string, args: string }> = [];

    // Graceful extraction of truncated tools on stream end
    let earliestStart = -1;
    let matchedTool = '';
    let isInvoke = false;
    let openTagFull = '';

    const invokeRegex = /<invoke\s+name="([^"]+)"[^>]*>/g;
    let invokeMatch = invokeRegex.exec(this.buffer);
    if (invokeMatch) {
      earliestStart = invokeMatch.index;
      matchedTool = invokeMatch[1];
      isInvoke = true;
      openTagFull = invokeMatch[0];
    }

    const directRegex = new RegExp(`<(${KNOWN_TOOLS.join('|')})(?:\\s+[^>]*)?>`, 'g');
    let directMatch = directRegex.exec(this.buffer);
    if (directMatch && (earliestStart === -1 || directMatch.index < earliestStart)) {
      earliestStart = directMatch.index;
      matchedTool = directMatch[1];
      isInvoke = false;
      openTagFull = directMatch[0];
    }

    if (earliestStart !== -1) {
      content += this.buffer.substring(0, earliestStart);
      const fullXml = this.buffer.substring(earliestStart);

      // For flush, we may not have a close tag — handle gracefully
      const closeTag = isInvoke ? `</invoke>` : `</${matchedTool}>`;
      const rawArgs = this.extractArgs(fullXml, openTagFull, closeTag, matchedTool, isInvoke);

      if (Object.keys(rawArgs).length > 0) {
        toolCalls.push({
          id: `call_${Date.now()}_${this.toolCallIdCounter++}`,
          toolName: mapToolName(matchedTool),
          args: JSON.stringify(mapArguments(matchedTool, rawArgs))
        });
      }
    } else {
      content += this.buffer;
    }

    content = content.replace(/<\/?function_calls>/g, '');
    this.buffer = '';

    return { content, toolCalls };
  }

  /**
   * Extract arguments from a tool call XML fragment.
   * Works with both complete and truncated XML (for flush).
   */
  private extractArgs(
    fullXml: string,
    openTagFull: string,
    closeTag: string,
    matchedTool: string,
    isInvoke: boolean
  ): Record<string, any> {
    const rawArgs: Record<string, any> = {};

    if (isInvoke) {
      // Parse <parameter name="...">...</parameter> format
      const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)(?:<\/parameter>|$)/g;
      let pMatch;
      let found = false;
      while ((pMatch = paramRegex.exec(fullXml)) !== null) {
        found = true;
        rawArgs[pMatch[1]] = unescapeXml(pMatch[2].trim());
      }
      if (!found) {
        const innerContent = fullXml.substring(openTagFull.length).replace(new RegExp(closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').trim();
        if (innerContent && !innerContent.includes('</function_calls>')) rawArgs['command'] = unescapeXml(innerContent);
      }
    } else {
      // Extract inner content (strip outer open/close tags)
      const closeIdx = fullXml.indexOf(closeTag);
      const innerXml = closeIdx !== -1
        ? fullXml.substring(openTagFull.length, closeIdx)
        : fullXml.substring(openTagFull.length);

      // Parse nested parameter tags (e.g. <path>...</path>, <content>...</content>)
      const paramRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)(?:<\/\1>|$)/g;
      let pMatch;
      let found = false;
      while ((pMatch = paramRegex.exec(innerXml)) !== null) {
        found = true;
        rawArgs[pMatch[1]] = unescapeXml(pMatch[2].trim());
      }
      // Fallback for simple content without nested tags (like <bash>ls -la</bash>)
      if (!found) {
        const innerContent = innerXml.trim();
        if (innerContent && !innerContent.includes('</function_calls>')) rawArgs['command'] = unescapeXml(innerContent);
      }
    }

    return rawArgs;
  }
}