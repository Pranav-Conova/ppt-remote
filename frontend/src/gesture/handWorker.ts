// Runs MediaPipe HandLandmarker off the main thread. Model start-up compiles
// a large WASM module and GPU shaders, which can take seconds, and each
// detection takes several ms. On the main thread that work would stall
// pointer and button messages from the phone.
import { HandLandmarker } from "@mediapipe/tasks-vision";
// The ES-module build of the loader: module workers cannot importScripts.
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";
import type { Point } from "./fingers";

export type WorkerIn = { type: "init" } | { type: "frame"; frame: ImageBitmap; t: number };
export type WorkerOut =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "result"; lm: Point[] | null; t: number }
  | { type: "error"; message: string };

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// tsconfig uses DOM typings, where self is a Window; inside the worker it is a DedicatedWorkerGlobalScope.
const scope = self as unknown as { postMessage(m: WorkerOut): void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };
const post = (m: WorkerOut) => scope.postMessage(m);

let landmarker: HandLandmarker | null = null;

async function create(delegate: "GPU" | "CPU") {
  return HandLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    },
  );
}

scope.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      try {
        landmarker = await create("GPU");
        post({ type: "ready", delegate: "GPU" });
      } catch {
        landmarker = await create("CPU");
        post({ type: "ready", delegate: "CPU" });
      }
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const { frame, t } = msg;
  try {
    const res = landmarker?.detectForVideo(frame, t);
    post({ type: "result", lm: res?.landmarks[0]?.map(({ x, y }) => ({ x, y })) ?? null, t });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    frame.close();
  }
};
