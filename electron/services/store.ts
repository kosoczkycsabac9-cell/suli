import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** Egyszerű, atomikus JSON fájl-alapú tároló (nincs külső függőség). */
export class JsonStore<T extends object> {
  private cache: T;
  private readonly file: string;

  constructor(fileName: string, private readonly defaults: T) {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, fileName);
    this.cache = this.read();
  }

  private read(): T {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      return { ...this.defaults, ...(JSON.parse(raw) as T) };
    } catch {
      return { ...this.defaults };
    }
  }

  get(): T {
    return this.cache;
  }

  set(patch: Partial<T>): T {
    this.cache = { ...this.cache, ...patch };
    this.flush();
    return this.cache;
  }

  replace(value: T): T {
    this.cache = value;
    this.flush();
    return this.cache;
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
  }

  get filePath(): string {
    return this.file;
  }
}
