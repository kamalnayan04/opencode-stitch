
/**
 * Tool Name and Argument Mappings for Stitch ↔ OpenCode
 * 
 * This module contains mappings to translate tool names and argument names
 * between Stitch backend format and OpenCode's internal tool format.
 */

/**
 * Map Stitch/gemini-cli tool names to opencode tool names
 */
export const TOOL_NAME_MAPPING: Record<string, string> = {
  // File operations
  'read_file': 'read',
  'write_file': 'write',      // function_calls format uses write_file
  'write_to_file': 'write',   // legacy format uses write_to_file
  'apply_diff': 'edit',
  'insert_content': 'edit',  // Insert is a form of edit
  'search_and_replace': 'edit',  // Search and replace is also edit
  'list_files': 'glob',
  'perform_file_operation': 'edit',  // File operations map to edit

  // Stitch hyphenated tool names (newer format)
  'file-search': 'grep',       // File search maps to grep
  'file-read': 'read',         // File read maps to read
  'file-write': 'write',       // File write maps to write
  'file-edit': 'edit',         // File edit maps to edit
  'file-list': 'glob',         // File list maps to glob
  'command-execute': 'bash',   // Command execute maps to bash

  // Search operations
  'search': 'grep',  // Generic search maps to grep
  'search_files': 'grep',
  'vector_query': 'grep',  // Vector query is semantic search, maps to grep
  'search_org': 'grep_app_searchGitHub',  // Organization search

  // Command execution
  'execute_command': 'bash',
  'execute': 'bash',

  // LSP operations - these already match opencode names
  'lsp': 'lsp',
  'lsp_goto_definition': 'lsp_goto_definition',
  'lsp_find_references': 'lsp_find_references',
  'lsp_symbols': 'lsp_symbols',
  'lsp_diagnostics': 'lsp_diagnostics',
  'lsp_prepare_rename': 'lsp_prepare_rename',
  'lsp_rename': 'lsp_rename',

  // Custom tool fallbacks
  'explore': 'bash',  // Directory exploration as bash (ls -la)

  // Todo operations
  'update_todo_list': 'todowrite',
  'update_plan': 'update_plan',  // Maps to itself

  // Task and mode operations
  'new_task': 'task',
  'switch_mode': 'task',

  // Directory listing
  'list_dir': 'bash',
  'list_directory': 'bash',

  // Question operations
  'ask_followup_question': 'question',

  // MCP operations
  'use_mcp_tool': 'skill_mcp',
  'access_mcp_resource': 'skill_mcp',

  // Web operations
  'web_search': 'google_search',  // or 'websearch_web_search_exa'
  'browser_action': 'look_at',

  // GitHub operations
  'github': 'grep_app_searchGitHub',
  'fetch_prs': 'grep_app_searchGitHub',

  // Operations that map to themselves (already correct)
  'read': 'read',
  'write': 'write',
  'edit': 'edit',
  'grep': 'grep',
  'glob': 'glob',
  'bash': 'bash',
  'command': 'bash',
  'shell': 'bash',
  'task': 'task',
  'question': 'question',
  'webfetch': 'webfetch',
  'todowrite': 'todowrite',
  'todoread': 'todoread',
  'look_at': 'look_at',
  'skill_mcp': 'skill_mcp',

  // Background and AST operations
  'background_launch_agent': 'task',
  'ast_grep_search': 'bash',
  'ast_grep': 'bash',
  'ast_grep_replace': 'bash',
  'session_info': 'bash',
  'background_output': 'task',
  'list_code_definition_names': 'bash',

  // Special operations
  'fetch_instructions': 'read',  // Fetching instructions is like reading
  'debug': 'bash',  // Debug operations use bash

  // sed-like operations (common model output for find-and-replace)
  'sed': 'edit',
  'replace': 'edit',
  'find_and_replace': 'edit',
  'str_replace': 'edit',
  'str_replace_editor': 'edit',

  // Multi-edit operations
  'multi_edit': 'multiedit',
  'multiedit': 'multiedit',
  'batch_edit': 'multiedit',

  // Apply patch
  'apply_patch': 'apply_patch',
  'patch': 'apply_patch',

  // Read variants
  'cat': 'read',
  'view': 'read',
  'view_file': 'read',
};

/**
 * Map argument names from Stitch/gemini-cli format to opencode format
 */
export const ARGUMENT_NAME_MAPPING: Record<string, Record<string, string>> = {
  // read_file → read: path → filePath
  'read_file': {
    'path': 'filePath',
    'line_range': 'offset',  // May need additional transformation
  },

  // write_file → write: path → filePath (function_calls format)
  'write_file': {
    'path': 'filePath',
    'file': 'filePath',
    'filename': 'filePath',
    'file_path': 'filePath',
    'filepath': 'filePath',
    'content': 'content',
    'text': 'content',
    'data': 'content',
    'body': 'content',
  },

  // write_to_file → write: path → filePath (legacy format)
  'write_to_file': {
    'path': 'filePath',
  },

  // apply_diff → edit: complex transformation needed
  'apply_diff': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
    'old_text': 'oldString',
    'new_text': 'newString',
    'old': 'oldString',
    'new': 'newString',
    'diff': 'oldString',
    'search': 'oldString',
    'replace': 'newString',
  },

  // insert_content → edit
  'insert_content': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
  },

  // search_and_replace → edit
  'search_and_replace': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
    'search': 'oldString',
    'replace': 'newString',
    'old': 'oldString',
    'new': 'newString',
    'find': 'oldString',
    'replacement': 'newString',
    'old_str': 'oldString',
    'new_str': 'newString',
  },

  // search_files → grep: regex → pattern
  'search_files': {
    'regex': 'pattern',
    'query': 'pattern',
    'term': 'pattern',
    'text': 'pattern',
    'search': 'pattern',
    'pattern': 'pattern',
  },

  // list_files → glob
  'list_files': {
    'pattern': 'pattern',
    'query': 'pattern',
  },

  'glob': {
    'pattern': 'pattern',
    'query': 'pattern',
  },

  // perform_file_operation → edit
  'perform_file_operation': {
    'path': 'filePath',
  },

  // Stitch hyphenated tool names argument mappings
  'file-read': {
    'path': 'filePath',
    'file': 'filePath',
  },

  'file-write': {
    'path': 'filePath',
    'file': 'filePath',
  },

  'file-edit': {
    'path': 'filePath',
    'file': 'filePath',
  },

  'file-search': {
    'query': 'pattern',
    'pattern': 'pattern',
  },

  'file-list': {
    // path stays as path for glob
  },

  'command-execute': {
    'cmd': 'command',
    'command': 'command',
  },

  // grep argument mapping - support all common variations
  'grep': {
    'search_term': 'pattern',
    'query': 'pattern',
    'term': 'pattern',
    'text': 'pattern',
    'search': 'pattern',
    'pattern': 'pattern',
    'directory': 'path',
    'file_pattern': 'glob',
    'glob': 'glob',
  },

  // search argument mapping (generic search tool)
  'search': {
    'query': 'pattern',
    'term': 'pattern',
    'text': 'pattern',
    'search': 'pattern',
    'pattern': 'pattern',
    'goal': 'description',
    'downstream': 'description',
    'request': 'description',
    'path': 'path',
  },

  // read argument mapping - support all common variations
  'read': {
    'path': 'filePath',
    'file': 'filePath',
    'filename': 'filePath',
    'file_path': 'filePath',
    'filepath': 'filePath',
    'start-line': 'startLine',
    'start_line': 'startLine',
    'startLine': 'startLine',
    'end-line': 'endLine',
    'end_line': 'endLine',
    'endLine': 'endLine',
    'offset': 'offset',
    'limit': 'limit'
  },

  // write argument mapping - support all common variations
  'write': {
    'path': 'filePath',
    'file': 'filePath',
    'filename': 'filePath',
    'file_path': 'filePath',
    'filepath': 'filePath',
    'content': 'content',
    'text': 'content',
    'data': 'content',
    'body': 'content',
  },

  // edit argument mapping - support all common variations
  'edit': {
    'path': 'filePath',
    'file': 'filePath',
    'filename': 'filePath',
    'file_path': 'filePath',
    'filepath': 'filePath',
    'old_str': 'oldString',
    'new_str': 'newString',
    'oldString': 'oldString',
    'newString': 'newString',
  },

  // bash argument mapping - support all common variations
  'bash': {
    'command': 'command',
    'cmd': 'command',
    'script': 'command',
    'code': 'command',
  },

  // execute argument mapping (maps to bash)
  'execute': {
    'command': 'command',
    'cmd': 'command',
  },

  // list_dir argument mapping (maps to bash)
  'list_dir': {
    'path': 'path',
  },

  // sed/str_replace argument mappings (map to edit)
  'sed': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
    'old': 'oldString',
    'old_str': 'oldString',
    'new': 'newString',
    'new_str': 'newString',
    'search': 'oldString',
    'replace': 'newString',
    'find': 'oldString',
    'replacement': 'newString',
    'pattern': 'oldString',
    'expression': 'oldString',
  },
  'str_replace': {
    'path': 'filePath',
    'file_path': 'filePath',
    'file': 'filePath',
    'old_str': 'oldString',
    'new_str': 'newString',
    'old': 'oldString',
    'new': 'newString',
  },
  'str_replace_editor': {
    'path': 'filePath',
    'file_path': 'filePath',
    'file': 'filePath',
    'old_str': 'oldString',
    'new_str': 'newString',
    'old': 'oldString',
    'new': 'newString',
  },
  'find_and_replace': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
    'find': 'oldString',
    'replace': 'newString',
    'search': 'oldString',
    'replacement': 'newString',
    'old': 'oldString',
    'new': 'newString',
  },
  'replace': {
    'path': 'filePath',
    'file': 'filePath',
    'file_path': 'filePath',
    'old': 'oldString',
    'new': 'newString',
    'search': 'oldString',
    'replace': 'newString',
    'find': 'oldString',
    'replacement': 'newString',
  },

  // Background agent mapping
  'background_launch_agent': {
    'agent_type': 'subagent_type',
    'goal': 'prompt',
    'mode': 'description',
  },

  'background_output': {
    'background_id': 'task_id',
  },

  // AST search mapping
  'ast_grep_search': {
    'pattern': 'pattern',
    'search_pattern': 'pattern',
    'query': 'pattern',
  },
};

/**
 * Generate bash command for custom tools that don't have SDK equivalents
 *
 * @param toolName - Original tool name
 * @param args - Tool arguments
 * @returns Generated bash command or null
 */
export function generateCustomToolCommand(toolName: string, args: Record<string, any>): string | null {
  switch (toolName) {
    case 'explore':
      // <explore><search_dir>dir</search_dir></explore>
      const dir = args.search_dir || args.directory || args.path || '.';
      return `ls -la ${dir}`;

    case 'list_dir':
    case 'list_directory':
      // {"tool": "list_dir", "path": "/some/path"}
      const listPath = args.path || '.';
      return `ls -la ${listPath}`;

    case 'ast_grep':
    case 'ast_grep_search':
      // <ast_grep><pattern>...</pattern></ast_grep>
      const pattern = args.pattern || args.search_pattern;
      if (!pattern) return null;
      return `sg run --pattern="${pattern}"`;

    case 'ast_grep_replace':
      // <ast_grep_replace><pattern>...</pattern><replacement>...</replacement></ast_grep_replace>
      const searchPattern = args.pattern || args.search_pattern;
      const replacement = args.replacement || args.replace_with;
      if (!searchPattern || !replacement) return null;
      return `sg run --pattern="${searchPattern}" --rewrite="${replacement}"`;

    case 'session_info':
      return `echo 'Session info: Project directory is ${process.cwd()}'`;

    case 'background_output':
      return `echo 'No background tasks currently running in this context.'`;

    default:
      return null;
  }
}

/**
 * Apply tool name mapping
 */
export function mapToolName(stitchToolName: string): string {
  return TOOL_NAME_MAPPING[stitchToolName] || stitchToolName;
}

/**
 * Apply argument name mapping with intelligent fallbacks
 */
export function mapArguments(stitchToolName: string, args: Record<string, any>): Record<string, any> {
  const argumentMapping = ARGUMENT_NAME_MAPPING[stitchToolName];
  const mappedToolName = mapToolName(stitchToolName);
  const mappedArgs: Record<string, any> = {};

  if (process.env.STITCH_DEBUG === 'true') {
    console.log(`[Tool Mapping] mapArguments called for tool: ${stitchToolName}`);
    console.log(`[Tool Mapping] Original args:`, JSON.stringify(args, null, 2));
  }

  // Handle list_dir and list_directory by generating bash command
  if (stitchToolName === 'list_dir' || stitchToolName === 'list_directory') {
    const listPath = args.path || '.';
    return { command: `ls -la ${listPath}` };
  }

  // Handle session_info and background_output (informational stubs)
  if (stitchToolName === 'session_info' || stitchToolName === 'background_output_stub') {
    const cmd = generateCustomToolCommand(stitchToolName, args);
    return { command: cmd };
  }

  // Handle ast_grep_search by generating bash command
  if (stitchToolName === 'ast_grep_search') {
    const pattern = args.pattern || args.search_pattern || args.query;
    if (pattern) {
      return { command: `sg run --pattern="${pattern}"`, description: `AST search for "${pattern}"` };
    }
  }

  if (argumentMapping) {
    // Apply specific mappings defined for this tool
    for (const [originalArgName, value] of Object.entries(args)) {
      const mappedArgName = argumentMapping[originalArgName];

      if (mappedArgName) {
        // This arg has a mapping, use the mapped name
        mappedArgs[mappedArgName] = value;
        if (process.env.STITCH_DEBUG === 'true') {
          console.log(`[Tool Mapping] Mapped arg: ${originalArgName} → ${mappedArgName}`);
        }
      } else {
        // No mapping for this arg, keep original name
        mappedArgs[originalArgName] = value;
      }
    }
  } else {
    // No specific mapping, use original args but apply intelligent fallbacks
    Object.assign(mappedArgs, args);

    if (process.env.STITCH_DEBUG === 'true') {
      console.log(`[Tool Mapping] No specific mapping for ${stitchToolName}, applying fallbacks`);
    }
  }

  // INTELLIGENT FALLBACKS: Handle common parameter variations not in explicit mappings
  // This ensures required parameters are never undefined

  // Fallback for filePath (used by read, write, edit tools)
  if ((mappedToolName === 'read' || mappedToolName === 'write' || mappedToolName === 'edit') && !mappedArgs.filePath) {
    const filePathValue = args.filePath || args.path || args.file || args.filename || args.file_path || args.filepath;
    if (filePathValue) {
      mappedArgs.filePath = filePathValue;
      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Fallback: Set filePath = "${filePathValue}"`);
      }
    }
  }

  // Fallback for content (used by write tool)
  if (mappedToolName === 'write' && !mappedArgs.content) {
    const contentValue = args.content || args.text || args.data || args.body;
    if (contentValue) {
      mappedArgs.content = contentValue;
      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Fallback: Set content`);
      }
    }
  }

  // Fallback for command (used by bash tool)
  if (mappedToolName === 'bash' && !mappedArgs.command) {
    const commandValue = args.command || args.cmd || args.script || args.code;
    if (commandValue) {
      mappedArgs.command = commandValue;
      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Fallback: Set command = "${commandValue}"`);
      }
    }
  }

  // Fallback for pattern (used by grep/search tools)
  if ((mappedToolName === 'grep' || mappedToolName.includes('search')) && !mappedArgs.pattern) {
    const patternValue = args.pattern || args.query || args.term || args.text || args.search || args.search_term;
    if (patternValue) {
      mappedArgs.pattern = patternValue;
      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Fallback: Set pattern = "${patternValue}"`);
      }
    }
  }

  // CRITICAL: Read tool math - convert start-line/end-line to offset/limit
  if (mappedToolName === 'read') {
    const startLineKey = args['start-line'] !== undefined ? 'start-line' :
      args['start_line'] !== undefined ? 'start_line' :
        args['startLine'] !== undefined ? 'startLine' : null;
    const endLineKey = args['end-line'] !== undefined ? 'end-line' :
      args['end_line'] !== undefined ? 'end_line' :
        args['endLine'] !== undefined ? 'endLine' : null;

    if (startLineKey) {
      mappedArgs.offset = Number(args[startLineKey]);
      delete mappedArgs['start-line'];
      delete mappedArgs['start_line'];
      delete mappedArgs['startLine'];

      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Converted ${startLineKey} to offset: ${mappedArgs.offset}`);
      }
    }

    // If we have both start and end lines, calculate limit
    if (startLineKey && endLineKey) {
      const startLine = Number(args[startLineKey]);
      const endLine = Number(args[endLineKey]);
      mappedArgs.limit = endLine - startLine + 1;
      delete mappedArgs['end-line'];
      delete mappedArgs['end_line'];
      delete mappedArgs['endLine'];

      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Calculated limit from ${startLineKey}=${startLine} and ${endLineKey}=${endLine}: ${mappedArgs.limit}`);
      }
    }
  }

  // CRITICAL: Handle task tool (background agents)
  if (mappedToolName === 'task') {
    // Handle background_launch_agent specific mapping
    if (stitchToolName === 'background_launch_agent') {
      // Ensure agent_type is mapped correctly (default to general)
      if (mappedArgs.subagent_type === 'librarian') {
        mappedArgs.subagent_type = 'general';
      } else if (!mappedArgs.subagent_type) {
        mappedArgs.subagent_type = args.agent_type || 'general';
      }

      // Synthesize description if missing
      if (!mappedArgs.description) {
        mappedArgs.description = args.goal || 'Background task';
      }
    }

    // Handle background_output specific mapping
    if (stitchToolName === 'background_output') {
      if (!mappedArgs.description) {
        mappedArgs.description = `Retrieving output for ${mappedArgs.task_id || 'task'}`;
      }
      if (!mappedArgs.prompt) {
        mappedArgs.prompt = 'Please provide the results of the background task.';
      }
    }
  }

  // CRITICAL: Auto-generate required fields for bash tool
  if (mappedToolName === 'bash') {
    // Generate description from command if not provided
    if (!mappedArgs.description) {
      const cmd = mappedArgs.command || '';
      mappedArgs.description = cmd.length > 100
        ? cmd.substring(0, 97) + '...'
        : cmd || 'Execute command';
    }

    // Remove timeout - not a bash tool parameter in SDK schema
    if (mappedArgs.timeout !== undefined) {
      delete mappedArgs.timeout;

      if (process.env.STITCH_DEBUG === 'true') {
        console.log('[Tool Mapping] Removed timeout field from bash tool (not in schema)');
      }
    }

    // Strip extraneous <command> tags if the model hallucinates them inside the command string
    if (typeof mappedArgs.command === 'string') {
      const originalCmd = mappedArgs.command;
      mappedArgs.command = mappedArgs.command
        .replace(/^<command>\s*/i, '')
        .replace(/\s*<\/command>$/i, '');

      if (process.env.STITCH_DEBUG === 'true' && originalCmd !== mappedArgs.command) {
        console.log(`[Tool Mapping] Stripped <command> tags from bash input`);
      }
    }

    if (process.env.STITCH_DEBUG === 'true') {
      console.log(`[Tool Mapping] Generated description for bash: "${mappedArgs.description}"`);
    }
  }

  // CRITICAL: Auto-generate required fields for write tool
  if (mappedToolName === 'write') {
    if (!mappedArgs.description) {
      const file = mappedArgs.filePath || 'file';
      mappedArgs.description = `Write to ${file}`;

      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Generated description for write: "${mappedArgs.description}"`);
      }
    }
  }

  // CRITICAL: Auto-generate required fields for edit tool
  if (mappedToolName === 'edit') {
    // Fallback: try to find oldString/newString from common variations
    if (!mappedArgs.oldString) {
      const oldVal = args.oldString || args.old_str || args.old || args.old_text || args.search || args.find || args.pattern;
      if (oldVal) {
        mappedArgs.oldString = oldVal;
      }
    }
    if (!mappedArgs.newString) {
      const newVal = args.newString || args.new_str || args.new || args.new_text || args.replace || args.replacement;
      if (newVal) {
        mappedArgs.newString = newVal;
      }
    }
    if (!mappedArgs.description) {
      const file = mappedArgs.filePath || 'file';
      mappedArgs.description = `Edit ${file}`;

      if (process.env.STITCH_DEBUG === 'true') {
        console.log(`[Tool Mapping] Generated description for edit: "${mappedArgs.description}"`);
      }
    }
  }

  if (process.env.STITCH_DEBUG === 'true') {
    console.log(`[Tool Mapping] Final mapped args for ${mappedToolName}:`, JSON.stringify(mappedArgs, null, 2));
  }

  return mappedArgs;
}

/**
 * Reverse map OpenCode tool name back to Stitch tool name
 * E.g., "bash" might have been "ast_grep" originally
 * 
 * @param openCodeToolName - The OpenCode tool name to reverse map
 * @returns The original Stitch tool name, or the input if no mapping found
 */
export function reverseMapToolName(openCodeToolName: string): string {
  // If the tool name exists natively in Stitch (maps to itself), prefer exact match
  if (TOOL_NAME_MAPPING[openCodeToolName] === openCodeToolName) {
    return openCodeToolName;
  }

  // Otherwise find the Stitch name that maps to this OpenCode name
  for (const [stitchName, mappedName] of Object.entries(TOOL_NAME_MAPPING)) {
    if (mappedName === openCodeToolName) {
      return stitchName;
    }
  }

  return openCodeToolName; // No reverse mapping found, use as-is
}

/**
 * Reverse map OpenCode argument names back to Stitch argument names
 * E.g., {pattern: "foo", filePath: "bar"} → {search_term: "foo", file_path: "bar"}
 * 
 * @param openCodeToolName - The OpenCode tool name (used to lookup mapping)
 * @param args - Arguments with OpenCode names
 * @returns Arguments with Stitch names
 */
export function reverseMapArguments(
  openCodeToolName: string,
  args: Record<string, any>
): Record<string, any> {
  // Get the original Stitch tool name
  const originalToolName = reverseMapToolName(openCodeToolName);
  const mappings = ARGUMENT_NAME_MAPPING[originalToolName] || ARGUMENT_NAME_MAPPING[openCodeToolName];

  if (!mappings) return args;

  // Create reverse mapping with preferred Stitch parameter names
  // Priority: underscore_style > hyphenated-style > camelCase > single word
  const reverseMap: Record<string, string> = {};

  // First pass: collect all candidates for each OpenCode arg
  const candidates: Record<string, string[]> = {};
  for (const [stitchArg, openCodeArg] of Object.entries(mappings)) {
    if (!candidates[openCodeArg]) {
      candidates[openCodeArg] = [];
    }
    candidates[openCodeArg].push(stitchArg);
  }

  // Second pass: select best candidate based on priority
  for (const [openCodeArg, stitchArgs] of Object.entries(candidates)) {
    // Prefer underscore style (file_path over filePath, search_term over searchTerm)
    const underscoreStyle = stitchArgs.find(arg => arg.includes('_') && arg.length > 5);
    if (underscoreStyle) {
      reverseMap[openCodeArg] = underscoreStyle;
      continue;
    }

    // Then prefer hyphenated style
    const hyphenatedStyle = stitchArgs.find(arg => arg.includes('-'));
    if (hyphenatedStyle) {
      reverseMap[openCodeArg] = hyphenatedStyle;
      continue;
    }

    // Finally use the first one (usually the simple one)
    reverseMap[openCodeArg] = stitchArgs[0];
  }

  // Apply reverse mapping
  const reversed: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    const reversedKey = reverseMap[key] || key;
    reversed[reversedKey] = value;
  }

  // FIX 6B: Convert offset/limit back to start-line/end-line for read tool
  // This prevents agent amnesia by keeping arguments in the format agent expects
  if (originalToolName === 'read' && reversed.offset !== undefined) {
    // Convert offset/limit back to start-line/end-line for agent context
    reversed['start-line'] = reversed.offset;
    if (reversed.limit !== undefined) {
      reversed['end-line'] = reversed.offset + reversed.limit - 1;
    }
    delete reversed.offset;
    delete reversed.limit;
  }

  return reversed;
}
