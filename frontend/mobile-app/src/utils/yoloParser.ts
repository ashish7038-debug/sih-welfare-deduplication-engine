export type ParsedYoloDetection = {
  class_name: string;
  box_area_ratio: number;
  confidence: number;
};

const DEFECT_CLASSES = ['pothole', 'alligator_crack', 'longitudinal_crack', 'lateral_crack', 'rutting'] as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function parseYoloDetectionsFromOutputs(rawOutputs: unknown[], frameWidth = 640, frameHeight = 640): ParsedYoloDetection[] {
  const firstOutput = rawOutputs?.[0];
  if (!firstOutput) return [];

  const flat = ArrayBuffer.isView(firstOutput)
    ? firstOutput
    : new Float32Array(firstOutput as ArrayBufferLike);

  if (!(flat instanceof Float32Array) && !(flat instanceof Uint8Array)) return [];

  const values = flat instanceof Float32Array ? flat : new Float32Array(flat.buffer.slice(flat.byteOffset, flat.byteOffset + flat.byteLength));
  if (values.length === 0) return [];

  const detections: ParsedYoloDetection[] = [];
  const tensorWidth = 8400;
  const rowSize = 84;

  for (let index = 0; index < tensorWidth; index += 1) {
    const offset = index * rowSize;
    if (offset + 4 >= values.length) continue;

    const cx = Number(values[offset]);
    const cy = Number(values[offset + 1]);
    const width = Number(values[offset + 2]);
    const height = Number(values[offset + 3]);

    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }

    let maxScore = 0;
    let classIndex = 0;

    for (let classPos = 4; classPos < rowSize; classPos += 1) {
      const score = Number(values[offset + classPos] ?? 0);
      if (score > maxScore) {
        maxScore = score;
        classIndex = classPos - 4;
      }
    }

    if (maxScore < 0.45) continue;

    const boxWidth = clamp(Math.abs(width), 12, frameWidth);
    const boxHeight = clamp(Math.abs(height), 12, frameHeight);
    const areaRatio = clamp((boxWidth * boxHeight) / (frameWidth * frameHeight), 0, 1);
    const className = DEFECT_CLASSES[classIndex % DEFECT_CLASSES.length] ?? 'pothole';

    detections.push({
      class_name: className,
      confidence: clamp(maxScore, 0, 1),
      box_area_ratio: areaRatio,
    });
  }

  return detections.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

export default parseYoloDetectionsFromOutputs;