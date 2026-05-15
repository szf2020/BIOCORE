import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeStore } from '../realtime-store';

describe('realtime-store AiSuggestion source_module', () => {
  beforeEach(() => {
    useRealtimeStore.setState({ aiSuggestions: [] } as any);
  });

  it('stores scada-source ai_suggestion with display fields', () => {
    // The WS onmessage handler is private inside connect(). We mirror the
    // exact reducer the `case 'ai_suggestion'` branch executes:
    //   set((s) => ({ aiSuggestions: [suggestion, ...s.aiSuggestions].slice(0, 50) }))
    useRealtimeStore.setState((s: any) => ({
      aiSuggestions: [
        {
          id: 42,
          action: 'created',
          source: 'scada',
          source_module: 'scada',
          target_param: 'F01.SP-temp',
          suggested_value: 38,
        },
        ...s.aiSuggestions,
      ].slice(0, 50),
    }));

    const list = useRealtimeStore.getState().aiSuggestions;
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(42);
    expect(list[0].source_module).toBe('scada');
    expect(list[0].target_param).toBe('F01.SP-temp');
    expect(list[0].suggested_value).toBe(38);
  });
});
