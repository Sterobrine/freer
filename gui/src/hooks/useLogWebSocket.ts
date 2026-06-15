import { useEffect, useState } from 'react';
import type { LogEntry } from '../api/types';
import { wsLogsUrl } from '../api/client';

export function useLogWebSocket(enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const ws = new WebSocket(wsLogsUrl());
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const entry = JSON.parse(ev.data) as LogEntry;
        setLogs((prev) => [...prev.slice(-499), entry]);
      } catch {
        setLogs((prev) => [...prev.slice(-499), { message: ev.data }]);
      }
    };
    return () => ws.close();
  }, [enabled]);

  const clear = () => setLogs([]);

  return { logs, connected, clear };
}
