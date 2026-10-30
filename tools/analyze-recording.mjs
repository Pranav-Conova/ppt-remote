#!/usr/bin/env node
// Summarises a Pointer Lab recording, step by step.
//
// Usage:
//   node tools/analyze-recording.mjs <recording-id> [base-url]
//   node tools/analyze-recording.mjs path/to/signify-gyro-....json
//
// base-url defaults to https://signify-4kql.onrender.com
import { existsSync, readFileSync } from "node:fs";

const [arg, base = "https://signify-4kql.onrender.com"] = process.argv.slice(2);
if (!arg) {
  console.error("usage: node tools/analyze-recording.mjs <recording-id | file.json> [base-url]");
  process.exit(1);
}

const rec = existsSync(arg)
  ? JSON.parse(readFileSync(arg, "utf8"))
  : await fetch(`${base.replace(/\/$/, "")}/api/recordings/${arg}`).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    });

// What each guided step should do to the pointer (screen y grows downwards).
const EXPECT = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1], still: [0, 0] };

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const pad = (s, n) => String(s).padEnd(n);

function window(series, t, start, end) {
  const out = {};
  const idx = [];
  t.forEach((ts, i) => ts >= start && ts <= end && idx.push(i));
  for (const [k, arr] of Object.entries(series)) if (Array.isArray(arr)) out[k] = idx.map((i) => arr[i]).filter((v) => v != null);
  return out;
}

console.log(`\nSignify Pointer Lab recording · ${rec.createdAt}`);
console.log(`Phone: ${rec.phoneModel || "(not given)"} · ${rec.device?.userAgent}`);
console.log(`Hold style: ${rec.holdStyle} · screen orientation: ${rec.device?.orientation?.type} (${rec.device?.orientation?.angle}°)`);
console.log(`Settings: ${JSON.stringify(rec.settings)}`);
console.log(`Reported issues: ${rec.issues?.length ? rec.issues.join("; ") : "(none)"}`);
if (rec.notes) console.log(`Notes: "${rec.notes}"`);

const m = rec.motion;
const intervals = m.t.slice(1).map((t, i) => t - m.t[i]);
console.log(
  `\nMotion: ${m.t.length} samples · ${f(1000 / mean(intervals), 1)} Hz (reported interval ${f(mean(m.interval.filter((v) => v != null)), 1)} ms, max gap ${f(Math.max(...intervals), 0)} ms)`,
);
console.log(`Orientation events: ${rec.orientation.t.length} · absolute: ${rec.orientation.absolute}`);
console.log("Axes per spec: α = rotation about X (tilt), β = about Y, γ = about Z (turn when flat)\n");

console.log(
  [pad("step", 7), pad("mean α/β/γ °/s", 22), pad("std α/β/γ", 19), pad("dominant", 9), pad("tilt°", 6), pad("pointer dx/dy", 15), pad("jitter", 7), "check"].join(" "),
);
for (const s of rec.steps) {
  const w = window(m, m.t, s.start, s.end ?? Infinity);
  const p = window(rec.pointer, rec.pointer.t, s.start, s.end ?? Infinity);
  const ma = [mean(w.ra), mean(w.rb), mean(w.rg)];
  const sa = [std(w.ra), std(w.rb), std(w.rg)];
  const absMeans = ma.map(Math.abs);
  const dominant = absMeans.every((v) => v < 1) ? "none" : ["α (X)", "β (Y)", "γ (Z)"][absMeans.indexOf(Math.max(...absMeans))];
  const g = [mean(w.gx), mean(w.gy), mean(w.gz)];
  const tilt = (Math.acos(Math.abs(g[2]) / Math.hypot(...g)) * 180) / Math.PI; // 0 = flat, 90 = upright
  const dx = p.x.length ? p.x.at(-1) - p.x[0] : NaN;
  const dy = p.y.length ? p.y.at(-1) - p.y[0] : NaN;
  // Jitter: RMS of the second difference of pointer position (shakiness).
  const dd = p.x.slice(2).map((x, i) => Math.hypot(x - 2 * p.x[i + 1] + p.x[i], p.y[i + 2] - 2 * p.y[i + 1] + p.y[i]));
  const jitter = Math.sqrt(mean(dd.map((v) => v * v)));

  let check = "";
  const exp = EXPECT[s.id];
  if (exp) {
    if (s.id === "still") check = Math.hypot(dx, dy) < 0.03 ? "✓ steady" : `✗ drifted ${f(Math.hypot(dx, dy))}`;
    else {
      const along = dx * exp[0] + dy * exp[1];
      const across = Math.abs(dx * exp[1] - dy * exp[0]);
      check =
        along > 0.1 && across < along * 0.5
          ? "✓"
          : along < -0.1
            ? "✗ reversed"
            : across > Math.abs(along)
              ? "✗ wrong axis"
              : "✗ barely moved";
    }
  }
  console.log(
    [
      pad(s.id, 7),
      pad(ma.map((v) => f(v, 1)).join(" / "), 22),
      pad(sa.map((v) => f(v, 1)).join(" / "), 19),
      pad(dominant, 9),
      pad(f(tilt, 0), 6),
      pad(`${f(dx)} / ${f(dy)}`, 15),
      pad(f(jitter * 1000, 2), 7),
      check,
    ].join(" "),
  );
}

const still = rec.steps.find((s) => s.id === "still");
if (still) {
  const w = window(m, m.t, still.start, still.end);
  console.log(
    `\nHolding still: gyro bias α/β/γ = ${[w.ra, w.rb, w.rg].map((a) => f(mean(a), 2)).join(" / ")} °/s, noise = ${[w.ra, w.rb, w.rg].map((a) => f(std(a), 2)).join(" / ")} °/s`,
  );
}
console.log("jitter = RMS 2nd difference of pointer position ×1000 (lower is smoother)\n");
