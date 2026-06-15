export type ApiError = { code: string; message: string };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type ChildEntry = {
  event: string;
  should_run_time: number;
  max_run_time: number;
  priority?: number;
};

export type FreerEvent = {
  name: string;
  event_type: 0 | 1;
  window_name?: string;
  symbol_start?: string | Record<string, unknown> | null;
  symbol_finish?: string | Record<string, unknown> | null;
  accuracy?: number;
  max_suc_run_time?: number;
  is_exception?: boolean;
  default_position?: number[][] | null;
  action?: string;
  gap?: [number, number];
  id?: number;
  event_list?: ChildEntry[];
  exception_list?: string[];
  max_rotate_time?: number;
  match_type_start?: string;
  match_type_finish?: string;
  roi_start?: number[];
  roi_finish?: number[];
  match_fallback_start?: string;
  match_fallback_finish?: string;
  last_resort_start?: string;
  last_resort_finish?: string;
  index_start?: number;
  index_finish?: number;
};

export type FreerAction = {
  name: string;
  id?: number;
  action_type: number;
  run_time: number;
  wait_time?: number | null;
  duration?: number | null;
  gap?: [number, number];
  text?: string;
};

export type ConfigPayload = {
  adb_device: string;
  data_dir: string;
  img_dir: string;
  capture_mode: string;
  log_level: string;
  log_dir: string;
  api: { host: string; port: number };
  recognition: {
    max_consecutive_miss_frames: number;
    last_known_ttl_frames: number;
  };
};

export type TaskStatus = {
  status: string;
  event_name: string | null;
  repeat_time: number;
  error: string | null;
  route: string | null;
  pause_pending: boolean;
  current_event: string | null;
};

export type TreeNode = {
  name: string;
  event_type: number;
  is_exception: boolean;
  role?: string;
  action?: string;
  children?: TreeNode[];
  exceptions?: TreeNode[];
  should_run_time?: number;
  max_run_time?: number;
  priority?: number;
  truncated?: boolean;
};

export type ValidationIssue = { code: string; message: string };

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type PreviewResult = {
  spec: Record<string, unknown>;
  rects: Array<{
    index: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    score: number;
    source: string;
  }>;
  positions: number[][];
  frame_id: number | null;
  capture_error: string | null;
};

export type LogEntry = {
  level?: string;
  message?: string;
  time?: string;
  [key: string]: unknown;
};
