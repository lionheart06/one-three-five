// Type declarations for @lionheart06/one-three-five.

export type Bucket = '1' | '3' | '5';
/** Anything that names Unassigned: null, undefined, 0 or '0'. */
export type Unassigned = null | undefined | 0 | '0';

export interface TodoObject {
  /** Stable id from the source. Strongly preferred: without it the key is a hash of the title. */
  id?: string | number;
  title: string;
  /** http(s) only; other schemes are not linked. */
  url?: string;
  meta?: unknown;
  [extra: string]: unknown;
}
export type Todo = string | TodoObject;

export interface BoardState {
  buckets: Record<Bucket, TodoObject[]>;
  unassigned: TodoObject[];
}

export interface StorageAdapter {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
}

export interface CreateOptions {
  /** Storage namespace for this board. Default "default". */
  listId?: string;
  /** Element or CSS selector to render into. Omit for a headless board (no UI). */
  mount?: Element | string;
  /** Initial list; same as calling setTodos(). */
  todos?: Todo[];
  /** "auto" (default) uses GM storage when granted, else localStorage, else memory. */
  storage?: 'auto' | 'gm' | 'local' | 'memory' | StorageAdapter;
  /** Custom task identity. Default: id, else a hash of the normalised title. */
  getKey?: (todo: TodoObject) => string | number;
  /** Bucket sizes. Default { 1: 1, 3: 3, 5: 5 }. */
  capacities?: Partial<Record<1 | 3 | 5, number>>;
  /** Days a task missing from the list keeps its bucket. Default 14. */
  retentionDays?: number;
  /** Return assignments made before today to Unassigned. Default false. */
  resetDaily?: boolean;
  /** Default "auto", which follows prefers-color-scheme. */
  theme?: 'auto' | 'light' | 'dark';
  /** Custom card content. Strings are inserted as text, never HTML. */
  renderTask?: (todo: TodoObject) => Node | string;
  /** Origin used in the GM storage key. Default location.origin. */
  origin?: string;
}

export interface BoardEvents {
  change: BoardState;
  assign: { key: string; from: Bucket | null; to: Bucket | null };
  full: { bucket: Bucket; dropped: string[] };
  warning: { message: string };
}

export interface Board {
  /** Resolves once stored assignments have loaded. Moves before that are refused. */
  readonly ready: Promise<void>;
  readonly listId: string;
  /** The storage actually in use, after fallbacks. */
  readonly storage: 'gm' | 'local' | 'memory' | 'custom';
  readonly capacities: Readonly<Record<Bucket, number>>;

  /** Replace the list and reconcile it with stored assignments. Safe to call any time. */
  setTodos(list: Todo[]): void;
  /** Move a task; index places it within the bucket. False only for an unknown key or bucket. */
  assign(key: string, bucket: Bucket | 1 | 3 | 5 | Unassigned, index?: number): boolean;
  /** Two tasks trade places across any zones, Unassigned included. */
  swap(keyA: string, keyB: string): boolean;
  /** Move every task back to Unassigned. */
  clear(): void;
  getState(): BoardState;
  keyOf(todo: Todo): string;
  bucketOf(key: string): Bucket | null;
  export(): string;
  import(json: string | object): boolean;
  show(): void;
  hide(): void;
  destroy(): void;
  on<E extends keyof BoardEvents>(event: E, fn: (payload: BoardEvents[E]) => void): void;
  off<E extends keyof BoardEvents>(event: E, fn: (payload: BoardEvents[E]) => void): void;
}

export const BUCKETS: readonly Bucket[];
export const version: string;
export function create(options?: CreateOptions): Board;
