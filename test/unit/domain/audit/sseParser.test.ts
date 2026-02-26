import { describe, expect, it } from 'vitest';

import { createSSEParser } from '@/src/domain/audit/sseParser';

describe('createSSEParser', () => {
  it('parses single complete event', () => {
    const parser = createSSEParser();
    const sse =
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n';
    const events = parser.feed(sse);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('content_block_delta');
    expect(JSON.parse(events[0].data).delta.text).toBe('hello');
  });

  it('parses multiple events in one chunk', () => {
    const parser = createSSEParser();
    const sse =
      'event: content_block_delta\ndata: {"delta":{"text":"a"}}\n\nevent: content_block_delta\ndata: {"delta":{"text":"b"}}\n\n';
    const events = parser.feed(sse);
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0].data).delta.text).toBe('a');
    expect(JSON.parse(events[1].data).delta.text).toBe('b');
  });

  it('buffers partial events across chunks', () => {
    const parser = createSSEParser();
    const events1 = parser.feed('event: content_block_delta\n');
    expect(events1).toHaveLength(0);

    const events2 = parser.feed(
      'data: {"delta":{"text":"hello"}}\n\n',
    );
    expect(events2).toHaveLength(1);
    expect(events2[0].event).toBe('content_block_delta');
    expect(JSON.parse(events2[0].data).delta.text).toBe('hello');
  });

  it('handles message_start event', () => {
    const parser = createSSEParser();
    const sse =
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":100}}}\n\n';
    const events = parser.feed(sse);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message_start');
    expect(JSON.parse(events[0].data).message.usage.input_tokens).toBe(100);
  });

  it('handles message_stop event', () => {
    const parser = createSSEParser();
    const sse = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    const events = parser.feed(sse);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message_stop');
  });
});
