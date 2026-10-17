export type CancelScheduledWork = () => void;
export type PaintScheduler = (work: () => void) => CancelScheduledWork;

export interface PaintSchedulerOptions {
  /** Run a future task after the second frame. Defaults to true. */
  afterPaintTask?: boolean;
  /** Optional deadline for progress when a browser stops delivering frames. */
  fallbackMs?: number;
  /** Return false to schedule a future task without waiting for frames. */
  canUseFrames?: () => boolean;
  requestFrame?: (callback: () => void) => CancelScheduledWork;
  scheduleTask?: (callback: () => void, delayMs: number) => CancelScheduledWork;
}

function requestFrame(callback: () => void): CancelScheduledWork {
  const frame = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(frame);
}

function scheduleTask(
  callback: () => void,
  delayMs: number,
): CancelScheduledWork {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

/** Two frames allow an intervening paint; callers choose hidden-view progress. */
export function createPaintScheduler({
  afterPaintTask = true,
  fallbackMs,
  canUseFrames = () => typeof requestAnimationFrame === "function",
  requestFrame: nextFrame = requestFrame,
  scheduleTask: nextTask = scheduleTask,
}: PaintSchedulerOptions = {}): PaintScheduler {
  return (work) => {
    let finished = false;
    let cancelFrame: CancelScheduledWork | undefined;
    let cancelTask: CancelScheduledWork | undefined;
    let cancelFallback: CancelScheduledWork | undefined;
    const cancel = () => {
      finished = true;
      cancelFrame?.();
      cancelTask?.();
      cancelFallback?.();
    };
    const run = () => {
      if (finished) return;
      cancel();
      work();
    };
    if (canUseFrames()) {
      cancelFrame = nextFrame(() => {
        if (finished) return;
        cancelFrame = nextFrame(() => {
          if (finished) return;
          if (afterPaintTask) cancelTask = nextTask(run, 0);
          else run();
        });
      });
      if (fallbackMs !== undefined) cancelFallback = nextTask(run, fallbackMs);
    } else {
      cancelTask = nextTask(run, 0);
    }
    return cancel;
  };
}

/** A future task, rather than a resolved promise, gives input a turn. */
export function yieldViewerWork(): Promise<unknown> {
  const browser = globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<unknown> };
  };
  if (typeof browser.scheduler?.yield === "function")
    return browser.scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export type ViewerUpdateStatus =
  "applied" | "superseded" | "cancelled" | "failed";
export interface ViewerUpdateResult {
  status: ViewerUpdateStatus;
  error?: unknown;
}
export interface ViewerUpdateContext {
  isCurrent(): boolean;
  yield(): Promise<boolean>;
  shouldYield(): boolean;
}
export type ViewerWork = (context: ViewerUpdateContext) => unknown;
export interface ViewerUpdateOptions {
  onError?: ((error: unknown) => void | Promise<void>) | undefined;
}
export interface ViewerSchedulerOptions {
  scheduleAfterPaint?: (callback: () => void) => () => void;
  yieldWork?: () => Promise<unknown>;
  now?: () => number;
  budget: () => number;
}
export interface ViewerUpdateScheduler {
  schedule(
    key: string | object,
    work: ViewerWork,
    options?: ViewerUpdateOptions,
  ): Promise<ViewerUpdateResult>;
  cancel(key: string | object): void;
  cancelAll(): void;
  whenIdle(): Promise<void>;
}
interface ViewerPaintGate {
  ready: boolean;
  promise: Promise<void>;
  release: () => void;
  cancel: (() => void) | null;
}
interface ViewerUpdateJob {
  key: string | object;
  work: ViewerWork;
  onError: ViewerUpdateOptions["onError"];
  resolve: (result: ViewerUpdateResult) => void;
  settled: boolean;
  paint: ViewerPaintGate;
}

/** Keyed, serial map application. Network requests must run outside this queue. */
export function createViewerUpdateScheduler({
  scheduleAfterPaint = createPaintScheduler(),
  yieldWork = yieldViewerWork,
  now = () => performance.now(),
  budget,
}: ViewerSchedulerOptions): ViewerUpdateScheduler {
  const pending = new Map<string | object, ViewerUpdateJob>();
  const current = new Map<string | object, ViewerUpdateJob>();
  const idle = new Set<() => void>();
  let active: ViewerUpdateJob | null = null;
  let running = false;

  function nextPaint() {
    // The following assignments finish the existing synchronous gate construction.
    const gate = { ready: false } as ViewerPaintGate;
    gate.promise = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    gate.cancel = scheduleAfterPaint(() => {
      gate.ready = true;
      gate.cancel = null;
      gate.release();
    });
    return gate;
  }

  function settle(
    job: ViewerUpdateJob,
    status: ViewerUpdateStatus,
    error?: unknown,
  ) {
    if (job.settled) return;
    job.settled = true;
    job.paint.cancel?.();
    job.paint.cancel = null;
    job.paint.release();
    job.resolve(status === "failed" ? { status, error } : { status });
    if (current.get(job.key) === job) current.delete(job.key);
  }

  function finishIdle() {
    if (running || pending.size) return;
    for (const resolve of idle) resolve();
    idle.clear();
  }

  async function run() {
    running = true;
    let sliceStarted = now();
    try {
      while (pending.size) {
        const [key, job] = pending.entries().next().value!;
        pending.delete(key);
        active = job;
        const isCurrent = () => !job.settled && current.get(key) === job;
        const paintReady = job.paint.ready;
        await job.paint.promise;
        if (!isCurrent()) continue;
        if (!paintReady) sliceStarted = now();
        const context = {
          isCurrent,
          async yield() {
            await yieldWork();
            sliceStarted = now();
            return isCurrent();
          },
          shouldYield: () => now() - sliceStarted >= budget(),
        };
        try {
          await job.work(context);
          settle(job, isCurrent() ? "applied" : "superseded");
        } catch (error) {
          if (isCurrent()) {
            settle(job, "failed", error);
            try {
              if (job.onError) {
                void Promise.resolve(job.onError(error)).catch(() => {
                  // Asynchronous reporting must not leak unhandled failures.
                });
              }
            } catch {
              /* Error reporting must not stop unrelated work. */
            }
          } else {
            settle(job, "superseded");
          }
        }
        active = null;
        if (pending.size && now() - sliceStarted >= budget()) {
          await yieldWork();
          sliceStarted = now();
        }
      }
    } finally {
      active = null;
      running = false;
      finishIdle();
    }
  }

  return {
    schedule(key, work, { onError } = {}) {
      const previous = current.get(key);
      if (previous) settle(previous, "superseded");
      const promise = new Promise<ViewerUpdateResult>((resolve) => {
        const job = {
          key,
          work,
          onError,
          resolve,
          settled: false,
          paint: nextPaint(),
        };
        current.set(key, job);
        pending.set(key, job);
      });
      if (!running) void run();
      return promise;
    },
    cancel(key) {
      const job = current.get(key);
      if (job) settle(job, "cancelled");
      pending.delete(key);
      finishIdle();
    },
    cancelAll() {
      for (const job of current.values()) settle(job, "cancelled");
      if (active) settle(active, "cancelled");
      pending.clear();
      finishIdle();
    },
    whenIdle() {
      if (!running && !pending.size) return Promise.resolve();
      return new Promise<void>((resolve) => idle.add(resolve));
    },
  };
}
