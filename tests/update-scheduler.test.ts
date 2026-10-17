import { describe, expect, it } from "vitest";
import {
  createPaintScheduler,
  createViewerUpdateScheduler,
  yieldViewerWork,
  type PaintSchedulerOptions,
} from "../src/update-scheduler.js";

/** An explicit clock/queue port keeps scheduling tests independent of globals. */
function clock() {
  let time = 0;
  const frames = new Set<() => void>();
  const tasks = new Map<() => void, number>();
  const options: PaintSchedulerOptions = {
    canUseFrames: () => true,
    requestFrame(callback) {
      frames.add(callback);
      return () => {
        frames.delete(callback);
      };
    },
    scheduleTask(callback, delay) {
      tasks.set(callback, time + delay);
      return () => {
        tasks.delete(callback);
      };
    },
  };
  return {
    options,
    frames,
    tasks,
    now: () => time,
    frame() {
      const callbacks = [...frames];
      frames.clear();
      for (const callback of callbacks) callback();
    },
    advance(milliseconds = 0) {
      time += milliseconds;
      for (const [callback, due] of [...tasks]) {
        if (due <= time) {
          tasks.delete(callback);
          callback();
        }
      }
    },
  };
}

function harness() {
  const host = clock();
  let yields = 0;
  const scheduler = createViewerUpdateScheduler({
    scheduleAfterPaint: createPaintScheduler(host.options),
    now: host.now,
    budget: () => 8,
    yieldWork: async () => {
      yields++;
    },
  });
  return {
    ...host,
    scheduler,
    yields: () => yields,
    paint() {
      host.frame();
      host.frame();
      host.advance();
    },
  };
}

describe("paint scheduling", () => {
  it("allows two frames and a future task before applying work", () => {
    const host = clock();
    let applied = 0;
    createPaintScheduler(host.options)(() => applied++);
    host.advance();
    expect(applied).toBe(0);
    host.frame();
    host.advance();
    expect(applied).toBe(0);
    host.frame();
    expect(applied).toBe(0);
    host.advance();
    expect(applied).toBe(1);
    expect(host.frames.size + host.tasks.size).toBe(0);
  });

  it("can apply on the second frame and cancels its fallback deadline", () => {
    const host = clock();
    let applied = 0;
    createPaintScheduler({
      ...host.options,
      afterPaintTask: false,
      fallbackMs: 100,
    })(() => applied++);
    host.frame();
    expect(applied).toBe(0);
    host.frame();
    expect(applied).toBe(1);
    expect(host.tasks.size).toBe(0);
    host.advance(100);
    expect(applied).toBe(1);
  });

  it.each([0, 1])(
    "makes progress at the deadline after %i delivered frames",
    (frames) => {
      const host = clock();
      let applied = 0;
      createPaintScheduler({
        ...host.options,
        afterPaintTask: false,
        fallbackMs: 100,
      })(() => applied++);
      for (let index = 0; index < frames; index++) host.frame();
      host.advance(99);
      expect(applied).toBe(0);
      host.advance(1);
      expect(applied).toBe(1);
      expect(host.frames.size + host.tasks.size).toBe(0);
      host.frame();
      expect(applied).toBe(1);
    },
  );

  it("uses a future task when frame delivery is unavailable or disabled", () => {
    const host = clock();
    let applied = 0;
    createPaintScheduler({
      ...host.options,
      canUseFrames: () => false,
      fallbackMs: 100,
    })(() => applied++);
    expect(host.frames.size).toBe(0);
    expect(applied).toBe(0);
    host.advance();
    expect(applied).toBe(1);
  });

  it.each([0, 1, 2])(
    "cancels frames, future tasks and deadlines after %i frames",
    (frames) => {
      const host = clock();
      let applied = 0;
      const cancel = createPaintScheduler({ ...host.options, fallbackMs: 100 })(
        () => applied++,
      );
      for (let index = 0; index < frames; index++) host.frame();
      cancel();
      cancel();
      expect(host.frames.size + host.tasks.size).toBe(0);
      host.frame();
      host.advance(100);
      expect(applied).toBe(0);
    },
  );

  it("does not run a callback already dispatched when cancellation wins", () => {
    const host = clock();
    let applied = 0;
    const cancel = createPaintScheduler({ ...host.options, fallbackMs: 100 })(
      () => applied++,
    );
    const frame = [...host.frames][0]!;
    const fallback = [...host.tasks.keys()][0]!;
    cancel();
    frame();
    fallback();
    expect(applied).toBe(0);
    expect(host.frames.size + host.tasks.size).toBe(0);
  });

  it("releases scheduled resources even when work throws", () => {
    const host = clock();
    createPaintScheduler({
      ...host.options,
      afterPaintTask: false,
      fallbackMs: 100,
    })(() => {
      throw new Error("apply");
    });
    host.frame();
    expect(() => host.frame()).toThrow("apply");
    expect(host.frames.size + host.tasks.size).toBe(0);
  });

  it("yields to a future task using the browser or timer implementation", async () => {
    let complete = false;
    const pending = yieldViewerWork().then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    await pending;
    expect(complete).toBe(true);
  });
});

describe("keyed viewer updates", () => {
  it("does no work before paint and coalesces repeated keys", async () => {
    const h = harness();
    const applied: string[] = [];
    const old = h.scheduler.schedule("visibility", () => applied.push("old"));
    const latest = h.scheduler.schedule("visibility", () =>
      applied.push("latest"),
    );
    expect(applied).toEqual([]);
    expect(await old).toEqual({ status: "superseded" });
    h.paint();
    expect(await latest).toEqual({ status: "applied" });
    expect(applied).toEqual(["latest"]);
    await h.scheduler.whenIdle();
  });

  it("invalidates running work at its next current-intent check", async () => {
    const h = harness();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const applied: string[] = [];
    const old = h.scheduler.schedule("color", async (context) => {
      await held;
      if (context.isCurrent()) applied.push("old");
    });
    h.paint();
    await Promise.resolve();
    const latest = h.scheduler.schedule("color", () => applied.push("latest"));
    release();
    expect(await old).toEqual({ status: "superseded" });
    await Promise.resolve();
    expect(applied).toEqual([]);
    h.paint();
    expect(await latest).toEqual({ status: "applied" });
    expect(applied).toEqual(["latest"]);
  });

  it("gives later input its own paint boundary", async () => {
    const h = harness();
    const applied: string[] = [];
    const first = h.scheduler.schedule("first", () => applied.push("first"));
    h.frame();
    h.frame();
    const later = h.scheduler.schedule("later", () => applied.push("later"));
    h.advance();
    expect(await first).toEqual({ status: "applied" });
    expect(applied).toEqual(["first"]);
    h.frame();
    h.advance();
    expect(applied).toEqual(["first"]);
    h.frame();
    h.advance();
    expect(await later).toEqual({ status: "applied" });
    expect(applied).toEqual(["first", "later"]);
  });

  it.each([0, 1, 2])(
    "cancels pending work after %i frames and releases idle waiters",
    async (frames) => {
      const h = harness();
      let applied = false;
      const pending = h.scheduler.schedule("display", () => {
        applied = true;
      });
      for (let index = 0; index < frames; index++) h.frame();
      const idle = h.scheduler.whenIdle();
      h.scheduler.cancel("display");
      await idle;
      expect(await pending).toEqual({ status: "cancelled" });
      expect(applied).toBe(false);
      expect(h.frames.size + h.tasks.size).toBe(0);
    },
  );

  it("cancels active and queued work without leaving a closed paint gate", async () => {
    const h = harness();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = h.scheduler.schedule("first", () => held);
    h.paint();
    await Promise.resolve();
    let applied = false;
    const second = h.scheduler.schedule("second", () => {
      applied = true;
    });
    const idle = h.scheduler.whenIdle();
    h.scheduler.cancelAll();
    release();
    expect(await first).toEqual({ status: "cancelled" });
    expect(await second).toEqual({ status: "cancelled" });
    await idle;
    expect(applied).toBe(false);
    expect(h.frames.size + h.tasks.size).toBe(0);
  });

  it("uses the caller budget between independent jobs", async () => {
    const h = harness();
    const first = h.scheduler.schedule("a", () => h.advance(9));
    const second = h.scheduler.schedule("b", () => undefined);
    h.paint();
    await Promise.all([first, second]);
    expect(h.yields()).toBe(1);
  });

  it("reads the current budget and resets the work slice after cooperative yield", async () => {
    const host = clock();
    let budget = 8;
    const scheduler = createViewerUpdateScheduler({
      scheduleAfterPaint: createPaintScheduler(host.options),
      now: host.now,
      budget: () => budget,
      yieldWork: async () => undefined,
    });
    const pending = scheduler.schedule("chunked", async (context) => {
      host.advance(9);
      expect(context.shouldYield()).toBe(true);
      budget = 10;
      expect(context.shouldYield()).toBe(false);
      budget = 8;
      expect(await context.yield()).toBe(true);
      expect(context.shouldYield()).toBe(false);
    });
    host.frame();
    host.frame();
    host.advance();
    expect(await pending).toEqual({ status: "applied" });
  });

  it("returns false from cooperative yield after cancellation", async () => {
    const host = clock();
    let release!: () => void;
    const yielded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduler = createViewerUpdateScheduler({
      scheduleAfterPaint: createPaintScheduler(host.options),
      budget: () => 8,
      yieldWork: () => yielded,
    });
    let current: boolean | undefined;
    const pending = scheduler.schedule("a", async (context) => {
      current = await context.yield();
    });
    host.frame();
    host.frame();
    host.advance();
    await Promise.resolve();
    scheduler.cancel("a");
    release();
    await scheduler.whenIdle();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(current).toBe(false);
  });

  it("contains failures and continues unrelated work", async () => {
    const h = harness();
    const error = new Error("map removed");
    const errors: unknown[] = [];
    const failed = h.scheduler.schedule(
      "a",
      () => {
        throw error;
      },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
    );
    const next = h.scheduler.schedule("b", () => undefined);
    h.paint();
    expect(await failed).toStrictEqual({ status: "failed", error });
    expect(await next).toEqual({ status: "applied" });
    expect(errors).toEqual([error]);
  });

  it.each([undefined, null, false, 0, ""])(
    "preserves falsey thrown values in failed results and contains reporter failure (%s)",
    async (error) => {
      const h = harness();
      const errors: unknown[] = [];
      const failed = h.scheduler.schedule(
        "a",
        () => {
          throw error;
        },
        {
          onError: (reported) => {
            errors.push(reported);
            throw new Error("reporter");
          },
        },
      );
      const next = h.scheduler.schedule("b", () => undefined);
      h.paint();
      expect(await failed).toStrictEqual({ status: "failed", error });
      expect(await next).toEqual({ status: "applied" });
      expect(errors).toEqual([error]);
    },
  );

  it("does not block unrelated jobs or leak asynchronous reporter failures", async () => {
    const h = harness();
    const error = new Error("map removed");
    const reported: unknown[] = [];
    let release!: () => void;
    const report = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failed = h.scheduler.schedule(
      "failed",
      () => {
        throw error;
      },
      {
        onError: async (error) => {
          reported.push(error);
          await report;
          throw new Error("asynchronous reporter failed");
        },
      },
    );
    const next = h.scheduler.schedule("next", () => undefined);
    h.paint();
    try {
      expect(await failed).toStrictEqual({ status: "failed", error });
      expect(await next).toEqual({ status: "applied" });
      await h.scheduler.whenIdle();
      expect(reported).toEqual([error]);
    } finally {
      release();
    }
    // Let unhandled rejections surface to the real runner; no global patching.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it("isolates queues even when viewers use identical object keys", async () => {
    const a = harness();
    const b = harness();
    const key = {};
    const first = a.scheduler.schedule(key, () => undefined);
    const second = b.scheduler.schedule(key, () => undefined);
    a.scheduler.cancel(key);
    b.paint();
    expect(await first).toEqual({ status: "cancelled" });
    expect(await second).toEqual({ status: "applied" });
  });
});
