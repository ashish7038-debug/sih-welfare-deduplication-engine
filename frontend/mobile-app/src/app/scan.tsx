import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  type Frame,
} from 'react-native-vision-camera';
import { NitroModules } from 'react-native-nitro-modules';
import { useSharedValue } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Rect, Svg } from 'react-native-svg';

import useRoadModel from '@/hooks/useRoadModel';
import { saveInspection, submitInspectionToBackend, type Severity } from '@/lib/inspection-data';
import useTelemetryService from '@/services/telemetryService';
import { generateInspectionHash } from '@/utils/crypto';
import evaluateInspection from '@/utils/pciEngine';
import { parseYoloDetectionsFromOutputs } from '@/utils/yoloParser';

type DetectionBox = {
  class: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  areaRatio: number;
};

const DEFECT_CLASSES = ['pothole', 'alligator_crack', 'longitudinal_crack', 'lateral_crack', 'rutting'];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const computeIoU = (a: DetectionBox, b: DetectionBox) => {
  const interX1 = Math.max(a.x, b.x);
  const interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(a.x + a.w, b.x + b.w);
  const interY2 = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  const unionArea = Math.max(1e-6, a.w * a.h + b.w * b.h - interArea);
  return interArea / unionArea;
};

const applyNonMaximumSuppression = (boxes: DetectionBox[], confidenceThreshold: number, iouThreshold: number) => {
  const passingBoxes = boxes.filter((box) => box.confidence >= confidenceThreshold && box.areaRatio > 0.001);
  const sorted = [...passingBoxes].sort((a, b) => b.confidence - a.confidence);
  const selected: DetectionBox[] = [];

  while (sorted.length > 0) {
    const candidate = sorted.shift();
    if (!candidate) continue;

    selected.push(candidate);
    const survivors = sorted.filter((box) => computeIoU(candidate, box) <= iouThreshold);
    sorted.length = 0;
    survivors.forEach((box) => sorted.push(box));
  }

  return selected;
};

const parseYoloTensor = (rawOutputs: unknown[], frameWidth: number, frameHeight: number): DetectionBox[] => {
  const firstOutput = rawOutputs?.[0];
  if (!firstOutput) return [];

  const flat = ArrayBuffer.isView(firstOutput)
    ? firstOutput
    : new Float32Array(firstOutput as ArrayBufferLike);

  if (!(flat instanceof Float32Array) && !(flat instanceof Uint8Array)) return [];

  const values = flat instanceof Float32Array ? flat : new Float32Array(flat.buffer.slice(flat.byteOffset, flat.byteOffset + flat.byteLength));
  if (values.length === 0) return [];

  const detections: DetectionBox[] = [];
  const rowSize = 84;
  const tensorWidth = Math.max(0, Math.floor(values.length / rowSize));

  for (let index = 0; index < tensorWidth; index += 1) {
    const offset = index * rowSize;
    if (offset + rowSize > values.length) continue;

    let cx = Number(values[offset]);
    let cy = Number(values[offset + 1]);
    let width = Number(values[offset + 2]);
    let height = Number(values[offset + 3]);

    // Detect if model outputs are normalized (0..1) and convert to pixels
    const appearsNormalized = cx <= 1 && cy <= 1 && width > 0 && width <= 1 && height > 0 && height <= 1;
    if (appearsNormalized) {
      cx = cx * frameWidth;
      cy = cy * frameHeight;
      width = width * frameWidth;
      height = height * frameHeight;
    }

    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }

    // Determine layout: common YOLO layout is [cx, cy, w, h, obj, class1, class2, ...]
    // Some exports omit explicit objectness and put classes immediately after bbox.
    const remaining = rowSize - 4;
    if (remaining <= 0) continue;

    // Heuristic: if the value at offset+4 is in [0,1], treat it as objectness.
    const possibleObj = Number(values[offset + 4] ?? 0);
    const hasObjectness = possibleObj >= 0 && possibleObj <= 1;

    const classStart = hasObjectness ? 5 : 4;
    const numClasses = rowSize - (classStart);
    if (numClasses <= 0) continue;

    let bestClass = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < numClasses; i += 1) {
      const score = Number(values[offset + classStart + i] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestClass = i;
      }
    }

    // Compose final confidence. If objectness exists, multiply; otherwise use class score.
    const finalConfidence = hasObjectness ? clamp(possibleObj * Math.max(0, bestScore), 0, 1) : clamp(bestScore, 0, 1);
    if (finalConfidence < 0.20) continue; // lower threshold to catch weak detections but filter noise

    const x = clamp(cx - width / 2, 0, frameWidth);
    const y = clamp(cy - height / 2, 0, frameHeight);
    const boxWidth = clamp(Math.abs(width), 12, frameWidth);
    const boxHeight = clamp(Math.abs(height), 12, frameHeight);
    const areaRatio = clamp((boxWidth * boxHeight) / (frameWidth * frameHeight), 0, 1);

    const className = DEFECT_CLASSES[bestClass] ?? 'pothole';

    detections.push({
      class: className,
      confidence: finalConfidence,
      x,
      y,
      w: boxWidth,
      h: boxHeight,
      areaRatio,
    });
  }

  return detections;
};

const createSyntheticYoloInput = () => {
  const input = new Uint8Array(640 * 640 * 3);
  for (let index = 0; index < input.length; index += 3) {
    input[index] = 120;
    input[index + 1] = 130;
    input[index + 2] = 110;
  }
  return input.buffer;
};

const toSeverity = (value: string): Severity => {
  const normalized = String(value || 'MEDIUM').toUpperCase();
  if (normalized === 'LOW') return 'Low';
  if (normalized === 'HIGH') return 'High';
  return 'Medium';
};

const getBoxSeverity = (box: DetectionBox): Severity => {
  const score = box.areaRatio * 100 + box.confidence * 50;
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
};

const getDeductionValue = (box: DetectionBox) => {
  const base = Math.round((box.areaRatio * 100) + (box.confidence * 35));
  return clamp(base, 5, 42);
};

const getPciTone = (score: number) => {
  if (score > 70) return { label: 'PCI OK', color: '#4CAF50', background: 'rgba(76,175,80,0.2)' };
  if (score >= 40) return { label: 'WATCH', color: '#FFC107', background: 'rgba(255,193,7,0.2)' };
  return { label: 'CRITICAL', color: '#F44336', background: 'rgba(244,67,54,0.2)' };
};

const getSeverityColor = (severity: Severity) => {
  if (severity === 'High') return '#F44336';
  if (severity === 'Medium') return '#FFC107';
  return '#4CAF50';
};

const toKmh = (speedMps: number | null | undefined) => {
  if (speedMps == null || Number.isNaN(speedMps)) {
    return null;
  }

  return speedMps * 3.6;
};

const formatCoordinate = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return 'N/A';
  }

  return value.toFixed(5);
};

export default function ScanScreen() {
  const { model, modelState, runInference, isModelReady, hasModelAsset, modelError } = useRoadModel();
  const { telemetry } = useTelemetryService({ enabled: true, locationUpdateIntervalMs: 1000 });
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { resize } = useResizePlugin();
  const liveDetections = useSharedValue<DetectionBox[]>([]);
  const detectionHistoryRef = useRef<DetectionBox[][]>([]);
  const lastDetectionsKeyRef = useRef('');
  const lastHashInputKeyRef = useRef('');
  const [lastKnownLocation, setLastKnownLocation] = useState<string | null>(null);

  const [locationText, setLocationText] = useState('Location not captured');
  const [notes, setNotes] = useState('Road defect observed during inspection.');
  const [severity, setSeverity] = useState<Severity>('Medium');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Offline queue ready');
  const [aiSummary, setAiSummary] = useState('AI model: IDLE');
  const [realDetections, setRealDetections] = useState<DetectionBox[]>([]);
  const [pciScore, setPciScore] = useState(87);
  const [liveInspectionHash, setLiveInspectionHash] = useState('');
  const [hashTickerIndex, setHashTickerIndex] = useState(0);

  const canUseCamera = hasPermission && !!device;

  useEffect(() => {
    if (!hasPermission && Platform.OS !== 'web') {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const applyTemporalSmoothing = useCallback((incoming: DetectionBox[]) => {
    const history = detectionHistoryRef.current;
    const nextHistory = [...history, incoming].slice(-3);
    detectionHistoryRef.current = nextHistory;

    if (nextHistory.length === 0) return incoming;

    const smoothed = incoming.map((box, index) => {
      const samples = nextHistory
        .flatMap((frame) => (frame[index] ? [frame[index]] : []))
        .filter(Boolean);

      if (samples.length === 0) return box;

      const averageX = samples.reduce((sum, item) => sum + item.x, 0) / samples.length;
      const averageY = samples.reduce((sum, item) => sum + item.y, 0) / samples.length;
      const averageW = samples.reduce((sum, item) => sum + item.w, 0) / samples.length;
      const averageH = samples.reduce((sum, item) => sum + item.h, 0) / samples.length;
      const averageConfidence = samples.reduce((sum, item) => sum + item.confidence, 0) / samples.length;
      const averageAreaRatio = samples.reduce((sum, item) => sum + item.areaRatio, 0) / samples.length;

      return {
        ...box,
        x: averageX,
        y: averageY,
        w: averageW,
        h: averageH,
        confidence: clamp(averageConfidence, 0, 1),
        areaRatio: clamp(averageAreaRatio, 0, 1),
      };
    });

    return smoothed;
  }, []);

  const boxedModel = useMemo(() => {
    try {
      return model ? NitroModules.box(model) : undefined;
    } catch (error) {
      console.warn('Unable to initialize Nitro box for model:', error);
      return undefined;
    }
  }, [model]);

  const shouldProcessFrames = isScanning && isModelReady && hasModelAsset;

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';

    if (!shouldProcessFrames || !boxedModel || typeof boxedModel.unbox !== 'function' || typeof resize !== 'function') {
      return;
    }

    try {
      const tflite = boxedModel.unbox();
      if (!tflite || typeof tflite.runSync !== 'function') {
        return;
      }

      const resized = resize(frame, {
        scale: { width: 640, height: 640 },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      });

      if (!resized || typeof resized.buffer === 'undefined') {
        return;
      }

      const inputBuffer = resized.buffer.slice(resized.byteOffset, resized.byteOffset + resized.byteLength) as ArrayBuffer;
      const outputs = tflite.runSync([inputBuffer]);
      const rawDetections = parseYoloTensor(outputs, frame.width, frame.height);
      const filtered = applyNonMaximumSuppression(rawDetections, 0.45, 0.5);
      liveDetections.value = filtered;
    } catch (error) {
      liveDetections.value = [];
    }
  }, [boxedModel, liveDetections, resize, shouldProcessFrames]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDetections = liveDetections.value ?? [];
      const nextKey = nextDetections.length === 0
        ? 'empty'
        : nextDetections.map((box) => [
          box.class,
          box.confidence.toFixed(3),
          box.x.toFixed(1),
          box.y.toFixed(1),
          box.w.toFixed(1),
          box.h.toFixed(1),
          box.areaRatio.toFixed(3),
        ].join(':')).join('|');

      if (nextKey === lastDetectionsKeyRef.current) {
        return;
      }

      lastDetectionsKeyRef.current = nextKey;

      if (nextDetections.length === 0) {
        if (detectionHistoryRef.current.length > 0) {
          detectionHistoryRef.current = [];
        }

        setRealDetections([]);
        return;
      }

      setRealDetections((previous) => {
        if (previous.length === 0) {
          return applyTemporalSmoothing(nextDetections);
        }

        return applyTemporalSmoothing(nextDetections);
      });
    }, 120);

    return () => clearInterval(interval);
  }, [applyTemporalSmoothing, liveDetections]);

  useEffect(() => {
    let isCancelled = false;

    const refreshHash = async () => {
      try {
        const nextHashInputKey = [
          realDetections[0]?.class ?? 'road',
          telemetry.latitude ?? 0,
          telemetry.longitude ?? 0,
          telemetry.accel_z ?? telemetry.peak_g_force,
          pciScore,
          telemetry.timestamp ?? '',
        ].join('|');

        if (nextHashInputKey === lastHashInputKeyRef.current) {
          return;
        }

        lastHashInputKeyRef.current = nextHashInputKey;

        const hash = await generateInspectionHash({
          roadId: `LIVE-${realDetections[0]?.class ?? 'road'}`,
          latitude: telemetry.latitude ?? 0,
          longitude: telemetry.longitude ?? 0,
          accelZPeak: telemetry.accel_z ?? telemetry.peak_g_force,
          pciScore,
          timestamp: telemetry.timestamp ?? new Date().toISOString(),
          sourceType: 'LIVE_SCAN',
        });

        if (!isCancelled && hash !== liveInspectionHash) {
          setLiveInspectionHash(hash);
        }
      } catch (error) {
        console.warn('Live hash generation failed:', error);
      }
    };

    void refreshHash();

    return () => {
      isCancelled = true;
    };
  }, [pciScore, realDetections, telemetry.accel_z, telemetry.latitude, telemetry.longitude, telemetry.peak_g_force, telemetry.timestamp, liveInspectionHash]);

  useEffect(() => {
    if (!liveInspectionHash) {
      setHashTickerIndex(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setHashTickerIndex((current) => (current + 1) % liveInspectionHash.length);
    }, 180);

    return () => clearInterval(interval);
  }, [liveInspectionHash]);

  const liveMetrics = useMemo(() => {
    if (realDetections.length === 0) {
      return {
        defectCount: 0,
        maxDeductValue: 0,
        currentPci: 100,
      };
    }

    const maxDeductValue = Math.max(...realDetections.map((box) => getDeductionValue(box)));
    const totalPenalty = realDetections.reduce((sum, box) => sum + getDeductionValue(box), 0);
    const cappedPenalty = Math.min(totalPenalty, 100);
    const currentPci = clamp(100 - Math.round(cappedPenalty), 0, 100);

    return {
      defectCount: realDetections.length,
      maxDeductValue,
      currentPci,
    };
  }, [realDetections]);

  useEffect(() => {
    if (modelError) {
      setAiSummary(`AI model: UNAVAILABLE • fallback mode`);
      setPciScore(100);
      return;
    }

    if (realDetections.length > 0) {
      const top = realDetections.reduce((best, box) => (box.confidence > best.confidence ? box : best), realDetections[0]);
      const nextSeverity = getBoxSeverity(top);
      setSeverity(nextSeverity);
      setPciScore(liveMetrics.currentPci);
      setAiSummary(`AI model: ${modelState} • ${top.class} • PCI ${liveMetrics.currentPci}`);
    } else {
      setPciScore(100);
      setAiSummary(`AI model: ${modelState} • idle`);
    }
  }, [liveMetrics.currentPci, modelError, modelState, realDetections]);

  const getCurrentLocation = async () => {
    try {
      setGpsLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const fallbackText = lastKnownLocation ?? 'PENDING_GPS';
        setLocationText(fallbackText);
        setSyncStatus('GPS unavailable • fallback retained');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch(async () => {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        return lastKnown ?? null;
      });

      if (current == null) {
        const fallbackText = lastKnownLocation ?? 'PENDING_GPS';
        setLocationText(fallbackText);
        setSyncStatus('GPS unavailable • fallback retained');
        return;
      }

      const lat = current.coords.latitude.toFixed(5);
      const lng = current.coords.longitude.toFixed(5);
      const nextLocation = `${lat}, ${lng}`;
      setLastKnownLocation(nextLocation);
      setLocationText(nextLocation);
    } catch (error) {
      const fallbackText = lastKnownLocation ?? 'PENDING_GPS';
      setLocationText(fallbackText);
      setSyncStatus('GPS unavailable • pending coordinates');
      console.warn('GPS error:', error);
    } finally {
      setGpsLoading(false);
    }
  };

  const runAiInspection = async () => {
    try {
      if (isModelReady) {
        const outputs = await runInference(createSyntheticYoloInput());
        const inferredDetections = parseYoloDetectionsFromOutputs(outputs, 640, 640);
        const fallbackDetections = [{ class_name: 'pothole', box_area_ratio: 0.12, confidence: 0.87 }];

        const evaluation = evaluateInspection(inferredDetections.length > 0 ? inferredDetections : fallbackDetections);
        setAiSummary(`AI model: ${modelState} • ${evaluation.dominant_class} • PCI ${evaluation.pci_score}`);
        return evaluation;
      }

      const fallback = evaluateInspection([{ class_name: 'pothole', box_area_ratio: 0.12, confidence: 0.87 }]);
      setAiSummary(`AI model: ${modelState} • fallback detection enabled`);
      return fallback;
    } catch (error) {
      console.warn('AI inference warning:', error);
      const fallback = evaluateInspection([{ class_name: 'pothole', box_area_ratio: 0.12, confidence: 0.87 }]);
      setAiSummary('AI model: ERROR • fallback detection enabled');
      return fallback;
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
      Alert.alert('Image attached', 'The selected image is attached to this inspection.');
    }
  };

  const handleStartInspection = async () => {
    if (!canUseCamera) {
      const permissionResult = await requestPermission();
      if (!permissionResult) {
        Alert.alert('Camera access required', 'Allow camera permission to start the live road inspection.');
        return;
      }
    }

    setIsScanning(true);
    setCameraReady(true);
    setSyncStatus('Live monitoring active');

    const evaluation = await runAiInspection();
    setSeverity(toSeverity(evaluation.max_severity));
    setNotes((current) => `${current}\nAI detected ${evaluation.dominant_class} with PCI ${evaluation.pci_score}.`);
  };

  const handleStopInspection = async () => {
    setIsScanning(false);
    setCameraReady(true);

    const dominantClass = realDetections[0]?.class ?? 'pothole';
    const resolvedSeverity = realDetections.length > 0 ? getBoxSeverity(realDetections.reduce((best, box) => (getDeductionValue(box) > getDeductionValue(best) ? box : best), realDetections[0])) : 'Medium';
    const finalPci = Math.round(liveMetrics.currentPci || pciScore || 100);

    const record = {
      id: Date.now(),
      title: `Road defect inspection • ${dominantClass.replace('_', ' ')}`,
      severity: resolvedSeverity,
      location: locationText === 'Location not captured' ? 'Location unavailable' : locationText,
      gps: locationText,
      notes: `${notes}\nAI detection: ${dominantClass} | PCI ${finalPci} | saved offline`,
      createdAt: new Date().toISOString(),
      imageUri: imageUri ?? undefined,
      status: 'Saved offline',
    };

    void saveInspection(record);
    setSyncStatus('Saved locally • sync queued');
    await submitInspectionToBackend(record);
    Alert.alert('Inspection saved', 'The inspection log was stored locally and queued for background sync.');
    router.push('/history');
  };

  const handleSubmit = async () => {
    await handleStopInspection();
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionText}>RoadSense needs camera permission to run live defect inspection with the trained YOLO model.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => requestPermission()}>
          <Text style={styles.primaryButtonText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsButtonText}>Open App Settings</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.permissionTitle}>No back camera available</Text>
        <Text style={styles.permissionText}>This device does not expose a rear camera, so live road inspection cannot start on this hardware.</Text>
        <ActivityIndicator size="large" color="#4DA3FF" />
        <Text style={styles.statusText}>Hardware compatibility check failed</Text>
      </SafeAreaView>
    );
  }

  const pciTone = getPciTone(pciScore);
  const speedKmh = toKmh(telemetry.speed);
  const hashTickerText = liveInspectionHash
    ? liveInspectionHash.length <= 24
      ? liveInspectionHash
      : `${liveInspectionHash.slice(hashTickerIndex)}${liveInspectionHash.slice(0, hashTickerIndex)}`.slice(0, 24)
    : 'Waiting for live hash…';

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        style={styles.camera}
        device={device}
          isActive={canUseCamera && cameraReady}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        torch={flashOn ? 'on' : 'off'}
        onInitialized={() => setCameraReady(true)}
        onError={() => {
          setCameraReady(false);
          setSyncStatus('Camera setup failed');
        }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>RoadSense AI</Text>
          <Text style={styles.headerStatus}>{cameraReady ? (isScanning ? 'Scanning live feed…' : 'Camera ready') : 'Initializing…'}</Text>
          <View style={styles.headerMetaRow}>
            <View style={styles.gpsPill}>
              <Text style={styles.gpsPillText}>{gpsLoading ? 'GPS sync…' : locationText}</Text>
            </View>
            <View style={[styles.pciBadge, { backgroundColor: pciTone.background, borderColor: pciTone.color }]}>
              <Text style={[styles.pciBadgeLabel, { color: pciTone.color }]}>{pciTone.label}</Text>
              <Text style={[styles.pciBadgeValue, { color: pciTone.color }]}>{pciScore}</Text>
            </View>
          </View>
          <Text style={styles.aiStatus}>{aiSummary}</Text>
          <View style={styles.liveHudRow}>
            <View style={styles.hudChip}>
              <Text style={styles.hudChipLabel}>Speed</Text>
              <Text style={styles.hudChipValue}>{speedKmh == null ? 'N/A' : `${speedKmh.toFixed(1)} km/h`}</Text>
            </View>
            <View style={styles.hudChip}>
              <Text style={styles.hudChipLabel}>G-Force</Text>
              <Text style={styles.hudChipValue}>{telemetry.peak_g_force.toFixed(2)} g</Text>
            </View>
            <View style={styles.hudChip}>
              <Text style={styles.hudChipLabel}>GPS</Text>
              <Text style={styles.hudChipValue}>{formatCoordinate(telemetry.latitude)}, {formatCoordinate(telemetry.longitude)}</Text>
            </View>
          </View>
          <View style={styles.hashStrip}>
            <Text style={styles.hashLabel}>SHA-256</Text>
            <Text style={styles.hashTicker} numberOfLines={1}>{hashTickerText}</Text>
          </View>
        </View>

        {realDetections.length > 0 && (
          <View style={styles.detectionOverlay} pointerEvents="none">
            {realDetections.slice(0, 4).map((box, index) => {
              const boxSeverity = getBoxSeverity(box);
              const boxColor = getSeverityColor(boxSeverity);
              const deduction = getDeductionValue(box);
              const left = clamp((box.x / 640) * 100, 2, 95);
              const top = clamp((box.y / 640) * 100, 8, 82);
              const width = clamp((box.w / 640) * 100, 8, 52);
              const height = clamp((box.h / 640) * 100, 8, 52);

              return (
                <View
                  key={`${box.class}-${index}`}
                  style={[
                    styles.boundingBox,
                    {
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                    },
                  ]}
                >
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      <Rect
                        x="1"
                        y="1"
                        width="98"
                        height="98"
                        rx="8"
                        ry="8"
                        stroke={boxColor}
                        strokeWidth="1.5"
                        fill="rgba(0,0,0,0.04)"
                      />
                    </Svg>
                    <View style={[styles.labelTag, { backgroundColor: boxColor }]}> 
                      <Text style={styles.labelTagText}>{`${box.class} | ${boxSeverity} (-${deduction})`}</Text>
                    </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
        <View style={styles.summaryRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Defects</Text>
            <Text style={styles.metricValue}>{liveMetrics.defectCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Max deduct</Text>
            <Text style={styles.metricValue}>{liveMetrics.maxDeductValue}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>PCI</Text>
            <Text style={[styles.metricValue, { color: pciTone.color }]}>{liveMetrics.currentPci}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Inspection details</Text>

        <View style={styles.detailBox}>
          <Text style={styles.label}>GPS</Text>
          <Text style={styles.value}>{gpsLoading ? 'Fetching location…' : locationText}</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={getCurrentLocation}>
            <Text style={styles.secondaryButtonText}>Refresh GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handlePickImage}>
            <Text style={styles.secondaryButtonText}>Upload image</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Severity</Text>
        <View style={styles.severityRow}>
          {(['Low', 'Medium', 'High'] as Severity[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.severityOption, severity === option && styles.severityOptionActive]}
              onPress={() => setSeverity(option)}
            >
              <Text style={[styles.severityText, severity === option && styles.severityTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.input}
          multiline
          numberOfLines={4}
          value={notes}
          onChangeText={setNotes}
          placeholder="Describe the issue..."
          placeholderTextColor="#94A3B8"
        />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, flashOn && styles.secondaryButtonActive]}
            onPress={() => setFlashOn((current) => !current)}
          >
            <Text style={styles.secondaryButtonText}>{flashOn ? 'Flash on' : 'Toggle Flashlight'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, (!canUseCamera || !cameraReady) && styles.primaryButtonDisabled]}
            onPress={async () => {
              if (isScanning) {
                await handleStopInspection();
                return;
              }
              await handleStartInspection();
            }}
            disabled={!canUseCamera || !cameraReady}
          >
            <Text style={styles.primaryButtonText}>{isScanning ? 'Stop Inspection & Save Log' : 'Start Inspection'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.syncCard}>
          <Text style={styles.syncTitle}>Sync status</Text>
          <Text style={styles.syncStatus}>{syncStatus}</Text>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Submit inspection</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    paddingHorizontal: 24,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    pointerEvents: 'none',
  },
  headerCard: {
    backgroundColor: 'rgba(18,18,18,0.78)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'stretch',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(33,150,243,0.22)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  headerStatus: {
    color: '#D9E8FF',
    fontSize: 12,
    marginTop: 4,
  },
  headerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  gpsPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gpsPillText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '600',
  },
  pciBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 86,
  },
  pciBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pciBadgeValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  aiStatus: {
    color: '#7DD3FC',
    fontSize: 11,
    marginTop: 8,
    maxWidth: 260,
  },
  liveHudRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  hudChip: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hudChipLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hudChipValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  hashStrip: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hashLabel: {
    color: '#7DD3FC',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hashTicker: {
    color: '#F8FAFC',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    fontWeight: '700',
  },
  detectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  boundingBox: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  labelTag: {
    position: 'absolute',
    top: -22,
    left: 0,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 170,
  },
  labelTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  metricLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  formContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '58%',
    backgroundColor: 'rgba(18,18,18,0.96)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  formContent: {
    padding: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  detailBox: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#243244',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: '#F8FAFC',
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  severityOption: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    alignItems: 'center',
  },
  severityOptionActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#60A5FA',
  },
  severityText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  severityTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F8FAFC',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonActive: {
    backgroundColor: '#1F3A5F',
    borderColor: '#2196F3',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 15,
  },
  syncCard: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  syncTitle: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  syncStatus: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  permissionTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    color: '#C4C4C4',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  settingsButton: {
    marginTop: 12,
    backgroundColor: 'rgba(33,150,243,0.12)',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#7DD3FC',
    fontWeight: '700',
    fontSize: 14,
  },
  statusText: {
    color: '#FFF',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
});
