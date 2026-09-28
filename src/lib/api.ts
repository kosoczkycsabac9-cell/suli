import type { OptimizerApi, Result } from '@shared/types';
import { createMockApi } from './mockApi';

declare global {
  interface Window {
    optimizer?: OptimizerApi;
  }
}

/** Igaz, ha nem Electron alatt futunk (böngészős UI-előnézet). */
export const IS_DEMO = typeof window === 'undefined' || !window.optimizer;

export const api: OptimizerApi = window.optimizer ?? createMockApi();

/** Result kicsomagolása; hiba esetén dob, hogy a hívó egységesen kezelhesse. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
