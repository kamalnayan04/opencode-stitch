// @ts-nocheck
/**
 * Parameter Mapping Test Suite
 * 
 * Tests to verify correct parameter mapping between OpenCode's snake_case format
 * and Stitch backend's proto format (which uses snake_case per config.proto).
 * 
 * Proto Reference: stitch-backend/proto/stitch-backend/chat/v1/config.proto
 * - Line 16: double top_p = 4;
 * - Line 18: int32 top_k = 5;
 * 
 * This test file follows Test-Driven Development (TDD):
 * GAP-10: Parameter Mapping for topP/topK
 */

import { describe, it, expect } from 'bun:test';
import { openCodeToStitchRequest, stitchToOpenCodeRequest } from '../request';
import type { OpenCodeRequest, StitchRequest } from '../types';

describe('Parameter Mapping - GAP-10', () => {
  describe('openCodeToStitchRequest - Sampling Parameters', () => {
    it('should map top_p from OpenCode to snake_case top_p in config (not camelCase topP)', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Per proto: double top_p = 4;
      // Should be config.top_p (snake_case), NOT config.topP (camelCase)
      expect(stitchReq.request.config).toBeDefined();
      expect(stitchReq.request.config.top_p).toBe(0.9);
      expect((stitchReq.request.config as any).topP).toBeUndefined(); // Should NOT have camelCase
    });

    it('should map top_k from OpenCode to snake_case top_k in config (not camelCase topK)', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_k: 40,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Per proto: int32 top_k = 5;
      // Should be config.top_k (snake_case), NOT config.topK (camelCase)
      expect(stitchReq.request.config).toBeDefined();
      expect(stitchReq.request.config.top_k).toBe(40);
      expect((stitchReq.request.config as any).topK).toBeUndefined(); // Should NOT have camelCase
    });

    it('should map both top_p and top_k together correctly', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.5,
        top_p: 0.95,
        top_k: 50,
        max_tokens: 2000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.config).toBeDefined();
      expect(stitchReq.request.config.temperature).toBe(0.5);
      expect(stitchReq.request.config.top_p).toBe(0.95);
      expect(stitchReq.request.config.top_k).toBe(50);
      expect(stitchReq.request.config.max_tokens).toBe(2000);
      
      // Verify no camelCase versions exist
      expect((stitchReq.request.config as any).topP).toBeUndefined();
      expect((stitchReq.request.config as any).topK).toBeUndefined();
    });

    it('should handle missing top_p gracefully', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_k: 40,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.config.top_p).toBeUndefined();
      expect(stitchReq.request.config.top_k).toBe(40);
    });

    it('should handle missing top_k gracefully', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.config.top_p).toBe(0.9);
      expect(stitchReq.request.config.top_k).toBeUndefined();
    });

    it('should handle missing both top_p and top_k gracefully', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.config.top_p).toBeUndefined();
      expect(stitchReq.request.config.top_k).toBeUndefined();
    });

    it('should preserve all other parameters when mapping top_p and top_k', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
        temperature: 0.8,
        top_p: 0.92,
        top_k: 45,
        max_tokens: 1500,
        reasoning_budget: 5000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      // Verify all parameters are preserved (focus on sampling parameters)
      expect(stitchReq.request.model).toBe('claude-4-5-sonnet');
      // Note: System messages are filtered out and consecutive same-role messages may be collapsed
      expect(stitchReq.request.messages.length).toBeGreaterThan(0);
      expect(stitchReq.request.config.temperature).toBe(0.8);
      expect(stitchReq.request.config.top_p).toBe(0.92);
      expect(stitchReq.request.config.top_k).toBe(45);
      expect(stitchReq.request.config.max_tokens).toBe(1500);
      expect(stitchReq.request.config.reasoning_config?.reasoning_budget).toBe(5000);
    });
  });

  describe('stitchToOpenCodeRequest - Round-trip Transformation', () => {
    it('should preserve top_p in round-trip transformation', () => {
      const originalReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_p: 0.85,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(originalReq);
      const roundTripReq = stitchToOpenCodeRequest(stitchReq);

      expect(roundTripReq.top_p).toBe(0.85);
    });

    it('should preserve top_k in round-trip transformation', () => {
      const originalReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_k: 35,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(originalReq);
      const roundTripReq = stitchToOpenCodeRequest(stitchReq);

      expect(roundTripReq.top_k).toBe(35);
    });

    it('should preserve both top_p and top_k in round-trip transformation', () => {
      const originalReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.6,
        top_p: 0.88,
        top_k: 42,
        max_tokens: 1200,
      };

      const stitchReq = openCodeToStitchRequest(originalReq);
      const roundTripReq = stitchToOpenCodeRequest(stitchReq);

      expect(roundTripReq.temperature).toBe(0.6);
      expect(roundTripReq.top_p).toBe(0.88);
      expect(roundTripReq.top_k).toBe(42);
      expect(roundTripReq.max_tokens).toBe(1200);
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle top_p = 0 (valid edge case)', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_p: 0,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.config.top_p).toBe(0);
    });

    it('should handle top_p = 1.0 (valid edge case)', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_p: 1.0,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.config.top_p).toBe(1.0);
    });

    it('should handle top_k = 1 (minimum valid value)', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_k: 1,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.config.top_k).toBe(1);
    });

    it('should handle very large top_k values', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'test' }],
        top_k: 1000,
        max_tokens: 1000,
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.config.top_k).toBe(1000);
    });
  });
});
