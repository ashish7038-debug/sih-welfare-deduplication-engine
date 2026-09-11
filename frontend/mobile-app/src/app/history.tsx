import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import useInspectionStore from '@/hooks/useInspectionStore';

const getSeverityTone = (pciScore: number) => {
  if (pciScore > 70) return { backgroundColor: '#14532D', color: '#BBF7D0' };
  if (pciScore >= 40) return { backgroundColor: '#78350F', color: '#FDE68A' };
  return { backgroundColor: '#7F1D1D', color: '#FECACA' };
};

const getSourceTone = (sourceType: string) => {
  if (String(sourceType).toUpperCase() === 'MANUAL_UPLOAD') {
    return { backgroundColor: '#1D4ED8', color: '#DBEAFE', label: 'MANUAL UPLOAD' };
  }

  return { backgroundColor: '#0F766E', color: '#CCFBF1', label: 'LIVE SCAN' };
};

const getSyncTone = (syncStatus: string) => {
  if (String(syncStatus).toUpperCase() === 'SYNCED') {
    return { backgroundColor: '#14532D', color: '#BBF7D0', label: 'SYNCED' };
  }

  return { backgroundColor: '#9A3412', color: '#FFEDD5', label: 'PENDING' };
};

export default function HistoryScreen() {
  const { inspections, refresh, isLoading, summary } = useInspectionStore();
  const [selectedInspection, setSelectedInspection] = useState<(typeof inspections)[number] | null>(null);
  const sortedInspections = useMemo(
    () => [...inspections].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [inspections],
  );

  const averagePci = useMemo(() => {
    if (sortedInspections.length === 0) {
      return 0;
    }

    return Math.round(sortedInspections.reduce((total, item) => total + item.pci_score, 0) / sortedInspections.length);
  }, [sortedInspections]);

  const modalSourceTone = selectedInspection ? getSourceTone(selectedInspection.source_type) : null;
  const modalSyncTone = selectedInspection ? getSyncTone(selectedInspection.sync_status) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>History</Text>
          <Text style={styles.title}>Audit Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/scan')}>
          <Text style={styles.primaryButtonText}>New scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{summary.total}</Text>
          <Text style={styles.metricLabel}>Total</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{summary.synced}</Text>
          <Text style={styles.metricLabel}>Synced</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{summary.pending}</Text>
          <Text style={styles.metricLabel}>Pending</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{averagePci}</Text>
          <Text style={styles.metricLabel}>Avg PCI</Text>
        </View>
      </View>

      <FlatList
        data={sortedInspections}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { void refresh(); }} tintColor="#7DD3FC" />}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No local inspections yet</Text>
            <Text style={styles.emptyText}>Saved inspections will appear here once the SQLite store has records.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setSelectedInspection(item)}>
            <View style={styles.rowBetween}>
              <View style={styles.titleWrap}>
                <Text style={styles.cardTitle}>{item.road_id}</Text>
                <Text style={styles.metaText}>{item.created_at}</Text>
              </View>
              <Text style={[styles.badge, getSeverityTone(item.pci_score)]}>
                PCI {Math.round(item.pci_score)}
              </Text>
            </View>
            <View style={styles.badgeRow}>
              <Text style={[styles.inlineBadge, getSourceTone(item.source_type)]}>{getSourceTone(item.source_type).label}</Text>
              <Text style={[styles.inlineBadge, getSyncTone(item.sync_status)]}>{getSyncTone(item.sync_status).label}</Text>
            </View>
            <Text style={styles.metaText}>GPS: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</Text>
            <Text style={styles.metaText}>Peak G: {item.peak_g_force.toFixed(3)} • Speed: {item.speed == null ? 'N/A' : `${item.speed.toFixed(2)} m/s`}</Text>
            <Text style={styles.metaText} numberOfLines={1}>SHA-256: {item.inspection_hash.slice(0, 18)}…</Text>
          </Pressable>
        )}
      />

      <Modal visible={selectedInspection != null} transparent animationType="fade" onRequestClose={() => setSelectedInspection(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedInspection(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>Inspection detail</Text>
                  <Text style={styles.modalTitle}>{selectedInspection?.road_id}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedInspection(null)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.badgeRow}>
                {modalSourceTone ? <Text style={[styles.inlineBadge, modalSourceTone]}>{modalSourceTone.label}</Text> : null}
                {modalSyncTone ? <Text style={[styles.inlineBadge, modalSyncTone]}>{modalSyncTone.label}</Text> : null}
                {selectedInspection ? <Text style={[styles.inlineBadge, getSeverityTone(selectedInspection.pci_score)]}>PCI {Math.round(selectedInspection.pci_score)}</Text> : null}
              </View>

              <View style={styles.detailGrid}>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Latitude</Text><Text style={styles.detailValue}>{selectedInspection?.latitude.toFixed(6)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Longitude</Text><Text style={styles.detailValue}>{selectedInspection?.longitude.toFixed(6)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Peak G</Text><Text style={styles.detailValue}>{selectedInspection?.peak_g_force.toFixed(3)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Speed</Text><Text style={styles.detailValue}>{selectedInspection?.speed == null ? 'N/A' : `${selectedInspection.speed.toFixed(2)} m/s`}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Accel X</Text><Text style={styles.detailValue}>{selectedInspection?.accel_x == null ? 'N/A' : selectedInspection.accel_x.toFixed(3)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Accel Y</Text><Text style={styles.detailValue}>{selectedInspection?.accel_y == null ? 'N/A' : selectedInspection.accel_y.toFixed(3)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Accel Z</Text><Text style={styles.detailValue}>{selectedInspection?.accel_z == null ? 'N/A' : selectedInspection.accel_z.toFixed(3)}</Text></View>
                <View style={styles.detailItem}><Text style={styles.detailLabel}>Captured</Text><Text style={styles.detailValue}>{selectedInspection?.created_at}</Text></View>
              </View>

              <View style={styles.hashBlock}>
                <Text style={styles.hashLabel}>SHA-256 Fingerprint</Text>
                <Text style={styles.hashValue}>{selectedInspection?.inspection_hash}</Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 78,
    backgroundColor: '#111827',
    borderColor: '#243244',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#94A3B8',
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eyebrow: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  list: {
    paddingBottom: 32,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#243244',
    padding: 16,
    marginBottom: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    paddingRight: 10,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  inlineBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  metaText: {
    color: '#CBD5E1',
    fontSize: 13,
    marginBottom: 4,
  },
  notes: {
    color: '#E2E8F0',
    marginTop: 10,
    lineHeight: 20,
  },
  status: {
    color: '#7DD3FC',
    marginTop: 10,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#243244',
    padding: 18,
    backgroundColor: '#111827',
    marginTop: 12,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: '#CBD5E1',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    maxHeight: '86%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#243244',
    overflow: 'hidden',
  },
  modalContent: {
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  modalEyebrow: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  closeButton: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 12,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  detailItem: {
    width: '48%',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#243244',
    borderRadius: 14,
    padding: 12,
  },
  detailLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  hashBlock: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#243244',
    borderRadius: 14,
    padding: 14,
  },
  hashLabel: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  hashValue: {
    color: '#F8FAFC',
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
});
