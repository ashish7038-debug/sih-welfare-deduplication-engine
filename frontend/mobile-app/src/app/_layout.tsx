import { Stack } from 'expo-router';
import { useEffect } from 'react';

import AppErrorBoundary from '@/components/AppErrorBoundary';
import { startInspectionSyncEngine } from '@/services/syncEngine';

export default function RootLayout() {
  useEffect(() => {
    const stopSync = startInspectionSyncEngine({
      baseUrl: 'http://127.0.0.1:8001',
    });

    return () => {
      stopSync();
    };
  }, []);

  return (
    <AppErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
    </AppErrorBoundary>
  );
}
