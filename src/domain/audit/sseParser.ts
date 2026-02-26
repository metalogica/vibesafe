export interface SSEEvent {
  event: string;
  data: string;
}

export function createSSEParser(): {
  feed(chunk: string): SSEEvent[];
} {
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  return {
    feed(chunk: string): SSEEvent[] {
      buffer += chunk;
      const events: SSEEvent[] = [];
      const lines = buffer.split('\n');

      // Keep the last element — it may be an incomplete line
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          // Empty line = event boundary
          if (currentEvent || currentData) {
            events.push({ event: currentEvent, data: currentData });
            currentEvent = '';
            currentData = '';
          }
        } else if (line.startsWith('event: ')) {
          currentEvent = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
          currentData = line.slice('data: '.length);
        }
      }

      return events;
    },
  };
}
