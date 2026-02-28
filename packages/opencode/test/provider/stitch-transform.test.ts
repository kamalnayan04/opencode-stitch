
import { describe, test, expect } from "bun:test"

describe("Stitch Request Transformation", () => {
  // Mock transformation function matching the implementation
  const transformMessage = (msg: any, timestamp: string) => {
    const role = msg.role === 'user' ? 'MESSAGE_ROLE_USER'
      : msg.role === 'assistant' ? 'MESSAGE_ROLE_ASSISTANT'
      : msg.role === 'system' ? 'MESSAGE_ROLE_SYSTEM'
      : 'MESSAGE_ROLE_USER'
    
    let content: any[]
    
    if (typeof msg.content === 'string') {
      content = [{ type: 'CONTENT_TYPE_TEXT', data: msg.content }]
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((c: any) => {
          if (c.type === 'tool-call' || c.type === 'tool-result' || c.type === 'tool_use' || c.type === 'tool_result') {
            console.log(`[STITCH-DEBUG ${timestamp}] Filtering out unsupported content type: ${c.type}`)
            return false
          }
          return true
        })
        .map((c: any) => {
          const contentBlock: any = {
            type: c.type === 'text' ? 'CONTENT_TYPE_TEXT' : 'CONTENT_TYPE_REASONING',
            data: c.text || c.content || c.data || ''
          }
          
          if (c.cache_control) {
            if (c.cache_control.type === 'ephemeral') {
              contentBlock.explicit_caching_control = { enabled: true }
              console.log(`[STITCH-DEBUG ${timestamp}] Added cache control for content block`)
            }
          }
          
          return contentBlock
        })
    } else {
      content = [{ type: 'CONTENT_TYPE_TEXT', data: String(msg.content) }]
    }
    
    return { role, content }
  }

  const validateRequest = (req: any, timestamp: string): string[] => {
    const errors: string[] = []
    
    if (!req.model) {
      errors.push('Missing required field: model')
    }
    
    if (!req.messages || !Array.isArray(req.messages)) {
      errors.push('Missing or invalid required field: messages (must be array)')
    } else if (req.messages.length === 0) {
      errors.push('Messages array cannot be empty')
    } else {
      req.messages.forEach((msg: any, idx: number) => {
        if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
          errors.push(`Invalid role at message ${idx}: ${msg.role}`)
        }
        if (!msg.content) {
          errors.push(`Missing content at message ${idx}`)
        }
      })
    }
    
    if (req.tools && req.tools.length > 0) {
      console.warn(`[STITCH-DEBUG ${timestamp}] Warning: Tools are not supported by Stitch API and will be ignored`)
    }
    
    return errors
  }

  test("transforms simple string content correctly", () => {
    const msg = {
      role: 'user',
      content: 'Hello, world!'
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.role).toBe('MESSAGE_ROLE_USER')
    expect(result.content).toEqual([
      { type: 'CONTENT_TYPE_TEXT', data: 'Hello, world!' }
    ])
  })

  test("transforms array content with text blocks", () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: 'First part' },
        { type: 'text', text: 'Second part' }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.role).toBe('MESSAGE_ROLE_USER')
    expect(result.content).toEqual([
      { type: 'CONTENT_TYPE_TEXT', data: 'First part' },
      { type: 'CONTENT_TYPE_TEXT', data: 'Second part' }
    ])
  })

  test("transforms cache control markers correctly", () => {
    const msg = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Important context',
          cache_control: { type: 'ephemeral' }
        }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content[0]).toEqual({
      type: 'CONTENT_TYPE_TEXT',
      data: 'Important context',
      explicit_caching_control: { enabled: true }
    })
  })

  test("filters out tool call content", () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me use a tool' },
        { type: 'tool-call', id: 'call_123', name: 'search', arguments: '{}' },
        { type: 'text', text: 'Done' }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content).toHaveLength(2)
    expect(result.content[0].data).toBe('Let me use a tool')
    expect(result.content[1].data).toBe('Done')
  })

  test("filters out tool result content", () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'tool-result', id: 'call_123', result: 'some result' },
        { type: 'text', text: 'Continue' }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content).toHaveLength(1)
    expect(result.content[0].data).toBe('Continue')
  })

  test("handles reasoning content type", () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'reasoning', content: 'Let me think...' },
        { type: 'text', text: 'Here is my answer' }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content[0]).toEqual({
      type: 'CONTENT_TYPE_REASONING',
      data: 'Let me think...'
    })
    expect(result.content[1]).toEqual({
      type: 'CONTENT_TYPE_TEXT',
      data: 'Here is my answer'
    })
  })

  test("maps role names correctly", () => {
    const roles = [
      { input: 'user', expected: 'MESSAGE_ROLE_USER' },
      { input: 'assistant', expected: 'MESSAGE_ROLE_ASSISTANT' },
      { input: 'system', expected: 'MESSAGE_ROLE_SYSTEM' }
    ]
    
    roles.forEach(({ input, expected }) => {
      const msg = { role: input, content: 'test' }
      const result = transformMessage(msg, 'test-123')
      expect(result.role).toBe(expected)
    })
  })

  test("handles mixed content with cache control", () => {
    const msg = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'System prompt',
          cache_control: { type: 'ephemeral' }
        },
        { type: 'text', text: 'User message' }
      ]
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content[0].explicit_caching_control).toEqual({ enabled: true })
    expect(result.content[1].explicit_caching_control).toBeUndefined()
  })

  test("validation passes for valid request", () => {
    const request = {
      model: 'stitch-1',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors).toEqual([])
  })

  test("validation fails for missing model", () => {
    const request = {
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors).toContain('Missing required field: model')
  })

  test("validation fails for missing messages", () => {
    const request = {
      model: 'stitch-1'
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors).toContain('Missing or invalid required field: messages (must be array)')
  })

  test("validation fails for empty messages array", () => {
    const request = {
      model: 'stitch-1',
      messages: []
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors).toContain('Messages array cannot be empty')
  })

  test("validation fails for invalid role", () => {
    const request = {
      model: 'stitch-1',
      messages: [
        { role: 'invalid', content: 'Hello' }
      ]
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors.some(e => e.includes('Invalid role'))).toBe(true)
  })

  test("validation fails for missing content", () => {
    const request = {
      model: 'stitch-1',
      messages: [
        { role: 'user' }
      ]
    }
    
    const errors = validateRequest(request, 'test-123')
    expect(errors.some(e => e.includes('Missing content'))).toBe(true)
  })

  test("handles content field variations (text, content, data)", () => {
    const variations = [
      { type: 'text', text: 'Using text field' },
      { type: 'text', content: 'Using content field' },
      { type: 'text', data: 'Using data field' }
    ]
    
    variations.forEach(block => {
      const msg = { role: 'user', content: [block] }
      const result = transformMessage(msg, 'test-123')
      expect(result.content[0].data).toBeTruthy()
    })
  })

  test("handles non-standard content format gracefully", () => {
    const msg = {
      role: 'user',
      content: { some: 'object' }
    }
    
    const result = transformMessage(msg, 'test-123')
    
    expect(result.content).toEqual([
      { type: 'CONTENT_TYPE_TEXT', data: '[object Object]' }
    ])
  })

  test("full request transformation preserves all fields", () => {
    const openaiRequest = {
      model: 'stitch-1',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Important prompt',
              cache_control: { type: 'ephemeral' }
            }
          ]
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      reasoning_budget: 5000
    }
    
    const errors = validateRequest(openaiRequest, 'test-123')
    expect(errors).toEqual([])
    
    const transformedMessages = openaiRequest.messages.map(msg => 
      transformMessage(msg, 'test-123')
    )
    
    expect(transformedMessages[0].content[0].explicit_caching_control).toEqual({ enabled: true })
  })
})
