// Feeds webcam frames to the hand-tracking worker (handWorker.ts) and reports
// landmarks back. Only one frame is in flight at a time. If detection is
// slower than the camera, frames are skipped instead of queued, so results
// are never stale.
import type { Point } from "./fingers";
import type { WorkerIn, WorkerOut } from "./handWorker";

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Calls onFrame with the first hand's landmarks (or null) for each processed
 * video frame. Resolves once the model is loaded; returns a stop function.
 */
export async function startHandTracking(
  video: HTMLVideoElement,
  onFrame: (lm: Point[] | null, now: number) => void,
): Promise<() => void> {
  const worker = new Worker(new URL("./handWorker.ts", import.meta.url), { type: "module" });
  const send = (m: WorkerIn, transfer: Transferable[] = []) => worker.postMessage(m, transfer);

  let busy = false;
  let stopped = false;

  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "ready") {
        console.info(`hand tracking ready (${m.delegate})`);
        resolve();
      } else if (m.type === "error") {
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || "hand tracking worker failed"));
    send({ type: "init" });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === "result") {
      busy = false;
      if (!stopped) onFrame(m.lm, m.t);
    } else if (m.type === "error") {
      busy = false;
      console.warn("hand tracking:", m.message);
    }
  };

  const v = video as VideoWithRVFC;
  let handle = 0;
  let lastTime = -1;

  const tick = async () => {
    if (stopped) return;
    schedule();
    if (busy || v.readyState < 2 || v.currentTime === lastTime) return;
    lastTime = v.currentTime;
    busy = true;
    try {
      const frame = await createImageBitmap(v);
      if (stopped) return frame.close();
      send({ type: "frame", frame, t: performance.now() }, [frame]);
    } catch {
      busy = false;
    }
  };
  const schedule = () => {
    handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  schedule();

  return () => {
    stopped = true;
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
    worker.terminate();
  };
}
