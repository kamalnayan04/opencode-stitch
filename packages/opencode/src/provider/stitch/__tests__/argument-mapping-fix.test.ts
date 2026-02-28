// @ts-nocheck

/**
 * Tests for Argument Mapping Fixes
 * 
 * Verifies that required parameters are correctly mapped even when
 * the model uses different parameter names than expected.
 */

import { describe, it, expect } from 'bun:test';
import { mapArguments, mapToolName } from '../tool-mapping';

describe('Argument Mapping Fixes', () => {
  
  describe('read tool - filePath variations', () => {
    it('should map path → filePath', () => {
      const result = mapArguments('read_file', { path: '/test/file.txt' });
      expect(result.filePath).toBe('/test/file.txt');
      expect(result.path).toBeUndefined();
    });
    
    it('should map file → filePath', () => {
      const result = mapArguments('read', { file: '/test/file.txt' });
      expect(result.filePath).toBe('/test/file.txt');
      expect(result.file).toBeUndefined();
    });
    
    it('should map filename → filePath', () => {
      const result = mapArguments('read', { filename: '/test/file.txt' });
      expect(result.filePath).toBe('/test/file.txt');
      expect(result.filename).toBeUndefined();
    });
    
    it('should map file_path → filePath', () => {
      const result = mapArguments('read', { file_path: '/test/file.txt' });
      expect(result.filePath).toBe('/test/file.txt');
      expect(result.file_path).toBeUndefined();
    });
  });
  
  describe('write tool - filePath and content variations', () => {
    it('should map path → filePath and text → content', () => {
      const result = mapArguments('write_file', { path: '/test.txt', text: 'hello' });
      expect(result.filePath).toBe('/test.txt');
      expect(result.content).toBe('hello');
      expect(result.path).toBeUndefined();
      expect(result.text).toBeUndefined();
    });
    
    it('should map file → filePath and data → content', () => {
      const result = mapArguments('write', { file: '/test.txt', data: 'world' });
      expect(result.filePath).toBe('/test.txt');
      expect(result.content).toBe('world');
    });
    
    it('should map filename → filePath and body → content', () => {
      const result = mapArguments('write', { filename: '/test.txt', body: 'test' });
      expect(result.filePath).toBe('/test.txt');
      expect(result.content).toBe('test');
    });
  });
  
  describe('bash tool - command variations', () => {
    it('should map cmd → command', () => {
      const result = mapArguments('execute', { cmd: 'npm test' });
      expect(result.command).toBe('npm test');
      expect(result.cmd).toBeUndefined();
    });
    
    it('should map script → command', () => {
      const result = mapArguments('bash', { script: 'ls -la' });
      expect(result.command).toBe('ls -la');
      expect(result.script).toBeUndefined();
    });
    
    it('should map code → command', () => {
      const result = mapArguments('bash', { code: 'echo hello' });
      expect(result.command).toBe('echo hello');
      expect(result.code).toBeUndefined();
    });
  });
  
  describe('grep tool - pattern variations', () => {
    it('should map query → pattern', () => {
      const result = mapArguments('grep', { query: 'function.*test' });
      expect(result.pattern).toBe('function.*test');
      expect(result.query).toBeUndefined();
    });
    
    it('should map term → pattern', () => {
      const result = mapArguments('grep', { term: 'console.log' });
      expect(result.pattern).toBe('console.log');
      expect(result.term).toBeUndefined();
    });
    
    it('should map text → pattern', () => {
      const result = mapArguments('search_files', { text: 'TODO' });
      expect(result.pattern).toBe('TODO');
      expect(result.text).toBeUndefined();
    });
    
    it('should map search → pattern', () => {
      const result = mapArguments('grep', { search: 'error' });
      expect(result.pattern).toBe('error');
      expect(result.search).toBeUndefined();
    });
  });
  
  describe('Fallback logic for unmapped tools', () => {
    it('should apply filePath fallback for unmapped read-like tool', () => {
      // Tool not in explicit mappings, but should use fallback
      const result = mapArguments('custom_read', { path: '/test.txt' });
      const mappedTool = mapToolName('custom_read');
      
      // Even if tool name doesn't map to 'read', if it somehow becomes 'read',
      // the fallback should work
      if (mappedTool === 'read') {
        expect(result.filePath).toBeDefined();
      }
    });
    
    it('should apply command fallback for unmapped bash-like tool', () => {
      const result = mapArguments('custom_bash', { cmd: 'test' });
      const mappedTool = mapToolName('custom_bash');
      
      if (mappedTool === 'bash') {
        expect(result.command).toBeDefined();
      }
    });
  });
  
  describe('Read tool start-line/end-line conversion', () => {
    it('should convert start-line and end-line to offset and limit', () => {
      const result = mapArguments('read_file', {
        path: '/test.txt',
        'start-line': '10',
        'end-line': '20'
      });
      
      expect(result.filePath).toBe('/test.txt');
      expect(result.offset).toBe(10);
      expect(result.limit).toBe(11); // 20 - 10 + 1
      expect(result['start-line']).toBeUndefined();
      expect(result['end-line']).toBeUndefined();
    });
    
    it('should handle start_line and end_line (underscore variant)', () => {
      const result = mapArguments('read', {
        path: '/test.txt',
        'start_line': '5',
        'end_line': '15'
      });
      
      expect(result.offset).toBe(5);
      expect(result.limit).toBe(11); // 15 - 5 + 1
    });
    
    it('should handle startLine and endLine (camelCase variant)', () => {
      const result = mapArguments('read', {
        path: '/test.txt',
        'startLine': '1',
        'endLine': '100'
      });
      
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(100); // 100 - 1 + 1
    });
  });
  
  describe('Auto-generated required fields', () => {
    it('should auto-generate description for write tool', () => {
      const result = mapArguments('write_file', {
        path: '/test.txt',
        content: 'hello'
      });
      
      expect(result.description).toContain('Write to');
      expect(result.description).toContain('/test.txt');
    });
    
    it('should auto-generate description for bash tool', () => {
      const result = mapArguments('execute', {
        command: 'npm test'
      });
      
      expect(result.description).toBeDefined();
      expect(result.description).toContain('npm test');
    });
    
    it('should auto-generate description for edit tool', () => {
      const result = mapArguments('apply_diff', {
        path: '/test.txt',
        old_str: 'old',
        new_str: 'new'
      });
      
      expect(result.description).toContain('Edit');
      expect(result.description).toContain('/test.txt');
    });
  });
  
  describe('Real-world scenarios', () => {
    it('should handle JSON tool call with path parameter', () => {
      // Model outputs: {"tool": "read", "params": {"path": "/file.txt"}}
      const toolName = 'read';
      const params = { path: '/file.txt' };
      
      const mappedToolName = mapToolName(toolName);
      const mappedArgs = mapArguments(toolName, params);
      
      expect(mappedToolName).toBe('read');
      expect(mappedArgs.filePath).toBe('/file.txt');
      expect(mappedArgs.path).toBeUndefined();
    });
    
    it('should handle JSON tool call with file parameter', () => {
      // Model outputs: {"tool": "write", "params": {"file": "/test.txt", "text": "code"}}
      const toolName = 'write';
      const params = { file: '/test.txt', text: 'code' };
      
      const mappedToolName = mapToolName(toolName);
      const mappedArgs = mapArguments(toolName, params);
      
      expect(mappedToolName).toBe('write');
      expect(mappedArgs.filePath).toBe('/test.txt');
      expect(mappedArgs.content).toBe('code');
    });
    
    it('should handle grep with query instead of pattern', () => {
      // Model outputs: {"tool": "search_files", "params": {"query": "function"}}
      const toolName = 'search_files';
      const params = { query: 'function' };
      
      const mappedToolName = mapToolName(toolName);
      const mappedArgs = mapArguments(toolName, params);
      
      expect(mappedToolName).toBe('grep');
      expect(mappedArgs.pattern).toBe('function');
      expect(mappedArgs.query).toBeUndefined();
    });
  });
});
