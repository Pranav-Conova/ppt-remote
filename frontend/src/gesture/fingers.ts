// Finger up/down detection from MediaPipe hand landmarks. This is a port of
// cvzone's HandDetector.fingersUp, which the original Django consumer used.
//
// Landmark indices: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16;
// pinky 17-20. Coordinates are normalized, with y growing downwards.

export interface Point {
  x: number;
  y: number;
}

export type Fingers = [number, number, number, number, number];

const TIPS = [4, 8, 12, 16, 20] as const;

/**
 * Returns [thumb, index, middle, ring, pinky] with 1 for up and 0 for down.
 *
 * cvzone decides the thumb from the hand's left/right label. That label flips
 * depending on whether the image is mirrored. Here the thumb counts as
 * extended when its tip lies further from the pinky side than its IP joint.
 * That gives the same answer for either hand, mirrored or not.
 */
export function fingersUp(lm: readonly Point[]): Fingers {
  const palmDir = lm[5].x - lm[17].x; // points from pinky side towards thumb side
  const thumb = (lm[TIPS[0]].x - lm[TIPS[0] - 1].x) * palmDir > 0 ? 1 : 0;
  const rest = TIPS.slice(1).map((tip) => (lm[tip].y < lm[tip - 2].y ? 1 : 0));
  return [thumb, rest[0], rest[1], rest[2], rest[3]];
}

export function samePattern(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
