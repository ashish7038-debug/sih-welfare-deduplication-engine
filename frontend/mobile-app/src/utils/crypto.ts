import * as Crypto from 'expo-crypto';

export type InspectionHashInput = {
  roadId: string | number;
  latitude: number | string;
  longitude: number | string;
  accelZPeak: number | string;
  pciScore: number | string;
  timestamp: number | string | Date;
  sourceType: string;
};

const toDeterministicString = (value: InspectionHashInput[keyof InspectionHashInput]) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '0';
    }

    return String(value);
  }

  return String(value ?? '').trim();
};

const toStableNumericString = (value: number | string | Date, precision: number) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '0';
  }

  return parsed.toFixed(precision);
};

export async function generateInspectionHash(input: InspectionHashInput): Promise<string> {
  const payload = [
    toDeterministicString(input.roadId),
    toStableNumericString(input.latitude, 6),
    toStableNumericString(input.longitude, 6),
    toStableNumericString(input.accelZPeak, 4),
    toStableNumericString(input.pciScore, 2),
    toDeterministicString(input.timestamp),
    toDeterministicString(input.sourceType).toUpperCase(),
  ].join('');

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
}

export default generateInspectionHash;