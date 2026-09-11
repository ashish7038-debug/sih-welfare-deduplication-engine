import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import useInspectionStore from '@/hooks/useInspectionStore';

const formatMetric = (value: number) => String(value).padStart(2, '0');

export default function DashboardScreen() {
  const { summary, inspections } = useInspectionStore();
  const highRiskCount = inspections.filter((item) => item.pci_score < 40).length;
  const todayCount = inspections.filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    if (Number.isNaN(createdAt)) {
      return false;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return createdAt >= startOfDay;
  }).length;

  const metrics = [
    { label: 'Inspections', value: formatMetric(summary.total) },
    { label: 'High Risk', value: formatMetric(highRiskCount) },
    { label: 'Today', value: formatMetric(todayCount) },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Operations dashboard</Text>
            <Text style={styles.title}>Daily Road Check</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
            <Text style={styles.profileText}>Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          {metrics.map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/scan')}>
            <Text style={styles.cardTitle}>Live Scan</Text>
            <Text style={styles.cardText}>Start road inspection with camera, GPS, and notes.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/upload')}>
            <Text style={styles.cardTitle}>Upload Image</Text>
            <Text style={styles.cardText}>Add a photo from gallery or camera without starting a new route.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/history')}>
            <Text style={styles.cardTitle}>Inspection Log</Text>
            <Text style={styles.cardText}>Review SQLite history, status, and severity trends.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/profile')}>
            <Text style={styles.cardTitle}>GPS & Settings</Text>
            <Text style={styles.cardText}>Manage GPS logs, profile, and logout options.</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  eyebrow: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  profileButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  profileText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#243244',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#94A3B8',
    marginTop: 8,
    fontSize: 12,
  },
  grid: {
    gap: 16,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#243244',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 22,
  },
});
