import { describe, expect, test } from 'bun:test'
import { conversationToMarkdown } from '../src/convert/markdown'
import { hydrateToolMessages } from '../src/tool-cache'
import type { ConversationDetail, Message } from '../src/types'

const cacheKey = (id: string): string => `inkstone:tool-cache:v1:${id}`

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  },
})

describe('tool output cache', () => {
  test('hydrates an empty tool message from a captured message', () => {
    const conversationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const cachedMessage: Message = {
      id: 'tool-1',
      author: { role: 'tool', name: 'web.run' },
      content: { content_type: 'code', language: 'json', text: '{"answer":42}' },
      metadata: { source: 'capture' },
    }
    localStorage.setItem(
      cacheKey(conversationId),
      JSON.stringify({
        messages: { 'tool-1': { capturedAt: 1, message: cachedMessage } },
        groups: [],
      }),
    )

    const conv = {
      conversation_id: conversationId,
      current_node: 'tool-node',
      mapping: {
        'tool-node': {
          id: 'tool-node',
          parent: null,
          children: [],
          message: {
            id: 'tool-1',
            author: { role: 'tool', name: 'web.run' },
            content: { content_type: 'code', language: 'json', text: '' },
            metadata: { is_visually_hidden_from_conversation: true },
          },
        },
      },
    } as unknown as ConversationDetail

    hydrateToolMessages(conv)
    expect(conv.mapping['tool-node']!.message!.content.text).toBe('{"answer":42}')
    expect(conv.mapping['tool-node']!.message!.metadata?.source).toBe('capture')
  })

  test('exports visually hidden tool results only when toolTraces is enabled', () => {
    const conv = {
      title: 'tool trace',
      conversation_id: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
      current_node: 'a2',
      mapping: {
        a1: {
          id: 'a1',
          parent: null,
          children: ['t1'],
          message: {
            id: 'a1',
            author: { role: 'assistant' },
            recipient: 'web.run',
            content: { content_type: 'text', parts: ['{"search_query":[{"q":"inkstone"}]}'] },
          },
        },
        t1: {
          id: 't1',
          parent: 'a1',
          children: ['a2'],
          message: {
            id: 'tool-2',
            author: { role: 'tool', name: 'web.run' },
            content: {
              content_type: 'code',
              language: 'json',
              text: '{"results":[{"title":"Inkstone"}]}',
            },
            metadata: {
              is_visually_hidden_from_conversation: true,
              inkstone_tool_name: 'web.run',
            },
          },
        },
        a2: {
          id: 'a2',
          parent: 't1',
          children: [],
          message: {
            id: 'a2',
            author: { role: 'assistant' },
            content: { content_type: 'text', parts: ['done'] },
          },
        },
      },
    } as unknown as ConversationDetail

    const off = conversationToMarkdown(conv).markdown
    expect(off).not.toContain('工具返回')
    expect(off).not.toContain('"results"')

    const on = conversationToMarkdown(conv, '', { toolTraces: true }).markdown
    expect(on).toContain('工具返回 ← `web.run`')
    expect(on).toContain('"results"')
  })
})
