import { debugLogger } from './debug-logger';
import type { OpenCodeRequest } from './types';

export function analyzeGaps(openCodeReq: OpenCodeRequest, stitchReq: any) {
  debugLogger.section('GAP ANALYSIS');
  
  // Check 1: Tools preservation
  const openCodeHasTools = !!openCodeReq.tools && openCodeReq.tools.length > 0;
  const stitchHasRequestTools = !!(stitchReq.request as any)?.tools;
  const stitchHasConfigTools = !!stitchReq.request?.config?.tools;
  
  if (openCodeHasTools && !stitchHasRequestTools && !stitchHasConfigTools) {
    debugLogger.error('GAP: Tools present in OpenCode request but missing in Stitch request', {
      opencode_tool_count: openCodeReq.tools?.length,
      stitch_request_tools: stitchHasRequestTools,
      stitch_config_tools: stitchHasConfigTools
    });
  } else {
    debugLogger.success('Tools preserved correctly', {
      opencode_tools: openCodeReq.tools?.length || 0,
      stitch_config_tools: stitchReq.request?.config?.tools?.length || 0
    });
  }
  
  // Check 2: Tool choice preservation
  if (openCodeReq.tool_choice && !stitchReq.request?.config?.tool_choice) {
    debugLogger.error('GAP: tool_choice present in OpenCode but missing in Stitch', {
      opencode_tool_choice: openCodeReq.tool_choice,
      stitch_tool_choice: stitchReq.request?.config?.tool_choice
    });
  }
  
  // Check 3: Message transformation
  if (openCodeReq.messages.length !== stitchReq.request?.messages?.length) {
    debugLogger.warning('Message count changed during transformation', {
      opencode_count: openCodeReq.messages.length,
      stitch_count: stitchReq.request?.messages?.length
    });
  }
  
  // Check 4: Tool content in messages (should not happen)
  // Use regex to detect actual XML tool tags, not just the word "tool"
  const XML_TOOL_PATTERN = /<([a-z_][a-z0-9_-]*)\s*>/i;
  const messagesWithToolContent = stitchReq.request?.messages?.filter((m: any) =>
    m.content?.some((c: any) => {
      const data = c.data || '';
      // Only flag if it contains actual XML tool tags, not just the word "tool"
      return XML_TOOL_PATTERN.test(data);
    })
  );
  
  if (messagesWithToolContent?.length > 0) {
    debugLogger.error('GAP: Tools appearing as text in messages', {
      affected_message_count: messagesWithToolContent.length,
      message_indices: messagesWithToolContent.map((_: any, idx: number) => idx)
    });
  }
}
