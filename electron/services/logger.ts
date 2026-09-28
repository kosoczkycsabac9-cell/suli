import { randomUUID } from 'node:crypto';
import type { LogEntry, LogLevel } from '../../shared/types';
import { JsonStore } from './store';

interface LogFile {
  entries: LogEntry[];
}

const MAX_ENTRIES = 5000;

/**
 * Audit log: minden módosítás bekerül (timestamp, action, old value, new value, siker).
 * Exportálható JSON/CSV formában a Restore Center / Settings oldalról.
 */
export class Logger {
  private store: JsonStore<LogFile>;
  private enabled = true;

  constructor() {
    this.store = new JsonStore<LogFile>('audit-log.json', { entries: [] });
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  record(input: {
    level?: LogLevel;
    area: string;
    action: string;
    oldValue?: string | null;
    newValue?: string | null;
    success: boolean;
    message?: string;
  }): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: input.level ?? (input.success ? 'success' : 'error'),
      area: input.area,
      action: input.action,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      success: input.success,
      message: input.message,
    };
    if (!this.enabled) return entry;
    const entries = [entry, ...this.store.get().entries].slice(0, MAX_ENTRIES);
    this.store.replace({ entries });
    return entry;
  }

  list(limit = 500): LogEntry[] {
    return this.store.get().entries.slice(0, limit);
  }

  all(): LogEntry[] {
    return this.store.get().entries;
  }

  clear(): void {
    this.store.replace({ entries: [] });
  }

  toCsv(): string {
    const header = 'timestamp,level,area,action,old_value,new_value,success,message';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = this.all().map((e) =>
      [e.timestamp, e.level, e.area, e.action, e.oldValue, e.newValue, e.success, e.message].map(esc).join(','),
    );
    return [header, ...rows].join('\r\n');
  }
}

export const logger = new Logger();
