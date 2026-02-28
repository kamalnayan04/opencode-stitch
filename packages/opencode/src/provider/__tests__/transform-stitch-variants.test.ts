
import { describe, it, expect } from 'bun:test';
import { ProviderTransform } from '../transform';
import type { Provider } from '../provider';

describe('Stitch Token Usage Variants', () => {
  it('should return token-based variants for Stitch models', () => {
    const stitchModel: Provider.Model = {
      id: 'stitch-test-model',
      providerID: 'stitch',
      api: {
        id: 'stitch-test-model',
        url: 'https://api.example.com/inference-service/v1',
        npm: '@ai-sdk/openai-compatible',
      },
      name: 'Stitch Test Model',
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        interleaved: false,
      },
      cost: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      limit: {
        context: 128000,
        output: 32000,
      },
      status: 'active',
      options: {},
      headers: {},
      release_date: '2025-01-01',
    };

    const variants = ProviderTransform.variants(stitchModel);

    expect(variants).toEqual({
      low: { maxTokens: 2048 },
      medium: { maxTokens: 8192 },
      high: { maxTokens: 16384 },
      extrahigh: { maxTokens: 32000 },
    });
  });

  it('should return reasoning effort variants for non-Stitch openai-compatible models', () => {
    const otherModel: Provider.Model = {
      id: 'other-test-model',
      providerID: 'other',
      api: {
        id: 'other-test-model',
        url: 'https://api.other.com/v1',
        npm: '@ai-sdk/openai-compatible',
      },
      name: 'Other Test Model',
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        interleaved: false,
      },
      cost: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      limit: {
        context: 128000,
        output: 32000,
      },
      status: 'active',
      options: {},
      headers: {},
      release_date: '2025-01-01',
    };

    const variants = ProviderTransform.variants(otherModel);

    expect(variants).toEqual({
      low: { reasoningEffort: 'low' },
      medium: { reasoningEffort: 'medium' },
      high: { reasoningEffort: 'high' },
    });
  });

  it('should return token variants for Stitch models even without reasoning capability', () => {
    // FIXED: Stitch models should ALWAYS get token variants, regardless of reasoning capability
    const nonReasoningModel: Provider.Model = {
      id: 'non-reasoning-model',
      providerID: 'stitch',
      api: {
        id: 'non-reasoning-model',
        url: 'https://api.example.com/inference-service/v1',
        npm: '@ai-sdk/openai-compatible',
      },
      name: 'Non-Reasoning Model',
      capabilities: {
        temperature: true,
        reasoning: false, // No reasoning capability - but Stitch should still get token variants
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        interleaved: false,
      },
      cost: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      limit: {
        context: 128000,
        output: 32000,
      },
      status: 'active',
      options: {},
      headers: {},
      release_date: '2025-01-01',
    };

    const variants = ProviderTransform.variants(nonReasoningModel);

    // Should return token variants because it's a Stitch model
    expect(variants).toEqual({
      low: { maxTokens: 2048 },
      medium: { maxTokens: 8192 },
      high: { maxTokens: 16384 },
      extrahigh: { maxTokens: 32000 },
    });
  });

  it('should return token variants for Stitch models when api.url is undefined', () => {
    // This is the actual production scenario - Stitch models have api.url = undefined
    const stitchModelWithUndefinedUrl: Provider.Model = {
      id: 'stitch-1',
      providerID: 'stitch',
      api: {
        id: 'stitch-1',
        url: undefined as any, // Production scenario: URL is undefined
        npm: '@ai-sdk/openai-compatible',
      },
      name: 'Stitch Model',
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        interleaved: false,
      },
      cost: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      limit: {
        context: 128000,
        output: 32000,
      },
      status: 'active',
      options: {},
      headers: {},
      release_date: '2025-01-01',
    };

    const variants = ProviderTransform.variants(stitchModelWithUndefinedUrl);

    // Should return token variants because providerID is 'stitch'
    expect(variants).toEqual({
      low: { maxTokens: 2048 },
      medium: { maxTokens: 8192 },
      high: { maxTokens: 16384 },
      extrahigh: { maxTokens: 32000 },
    });
  });

  it('should handle different Stitch API URLs correctly', () => {
    const testUrls = [
      'https://stitch.blinkit.com/inference-service/stream-chat-completion',
      'http://localhost:8080/inference-service/v1',
      'https://api.stitch.ai/inference-service',
    ];

    testUrls.forEach((url) => {
      const model: Provider.Model = {
        id: 'stitch-model',
        providerID: 'stitch',
        api: {
          id: 'stitch-model',
          url,
          npm: '@ai-sdk/openai-compatible',
        },
        name: 'Stitch Model',
        capabilities: {
          temperature: true,
          reasoning: true,
          attachment: false,
          toolcall: true,
          input: { text: true, audio: false, image: false, video: false, pdf: false },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
          interleaved: false,
        },
        cost: {
          input: 0,
          output: 0,
          cache: { read: 0, write: 0 },
        },
        limit: {
          context: 128000,
          output: 32000,
        },
        status: 'active',
        options: {},
        headers: {},
        release_date: '2025-01-01',
      };

      const variants = ProviderTransform.variants(model);

      expect(variants).toEqual({
        low: { maxTokens: 2048 },
        medium: { maxTokens: 8192 },
        high: { maxTokens: 16384 },
        extrahigh: { maxTokens: 32000 },
      });
    });
  });
});
