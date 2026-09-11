import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TelemetrySnapshot = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  peak_g_force: number;
  sourceType: 'LIVE_SCAN';
  timestamp: string | null;
};

export type TelemetryState = {
  telemetry: TelemetrySnapshot;
  isTracking: boolean;
  permissionGranted: boolean;
  error: string | null;
};

export type UseTelemetryServiceOptions = {
  enabled?: boolean;
  locationUpdateIntervalMs?: number;
};

const initialTelemetry: TelemetrySnapshot = {
  latitude: null,
  longitude: null,
  altitude: null,
  speed: null,
  accel_x: null,
  accel_y: null,
  accel_z: null,
  peak_g_force: 0,
  sourceType: 'LIVE_SCAN',
  timestamp: null,
};

export function useTelemetryService(options: UseTelemetryServiceOptions = {}): TelemetryState {
  const { enabled = true, locationUpdateIntervalMs = 1000 } = options;
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(initialTelemetry);
  const [isTracking, setIsTracking] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const accelerometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  const cleanupSubscriptions = useCallback(() => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

    accelerometerSubscriptionRef.current?.remove();
    accelerometerSubscriptionRef.current = null;
  }, []);

  useEffect(() => {
    let isActive = true;

    const startTracking = async () => {
      try {
        if (!enabled) {
          cleanupSubscriptions();
          if (isActive) {
            setIsTracking(false);
          }
          return;
        }

        setError(null);

        const locationPermission = await Location.requestForegroundPermissionsAsync();
        if (!locationPermission.granted) {
          if (isActive) {
            setPermissionGranted(false);
            setIsTracking(false);
            setError('Foreground location permission is required for live telemetry.');
          }
          cleanupSubscriptions();
          return;
        }

        const accelerometerAvailable = await Accelerometer.isAvailableAsync().catch(() => false);

        if (!isActive) {
          return;
        }

        setPermissionGranted(true);

        if (accelerometerAvailable) {
          Accelerometer.setUpdateInterval(100);
          accelerometerSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
            const peakGForce = Math.sqrt((x * x) + (y * y) + (z * z));

            setTelemetry((current) => ({
              ...current,
              accel_x: x,
              accel_y: y,
              accel_z: z,
              peak_g_force: Math.max(current.peak_g_force, peakGForce),
              timestamp: new Date().toISOString(),
            }));
          });
        }

        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: locationUpdateIntervalMs,
            distanceInterval: 0,
          },
          (location) => {
            const { coords } = location;

            setTelemetry((current) => ({
              ...current,
              latitude: coords.latitude,
              longitude: coords.longitude,
              altitude: coords.altitude ?? null,
              speed: coords.speed ?? null,
              timestamp: new Date(location.timestamp).toISOString(),
            }));
          },
          (locationError) => {
            setError(locationError.message);
          },
        );

        if (isActive) {
          setIsTracking(true);
        }
      } catch (trackingError) {
        if (!isActive) {
          return;
        }

        const message = trackingError instanceof Error ? trackingError.message : 'Unable to start telemetry tracking.';
        setError(message);
        setIsTracking(false);
        setPermissionGranted(false);
        cleanupSubscriptions();
      }
    };

    void startTracking();

    return () => {
      isActive = false;
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions, enabled, locationUpdateIntervalMs]);

  return {
    telemetry,
    isTracking,
    permissionGranted,
    error,
  };
}

export default useTelemetryService;