import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>Ashish Verma</Text>
        <Text style={styles.subtext}>Road inspection officer</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>Field Engineer</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>GPS status</Text>
          <Text style={styles.value}>Enabled</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Uploads today</Text>
          <Text style={styles.value}>04</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={() => router.replace('/')}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#243244',
    padding: 22,
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
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  subtext: {
    color: '#CBD5E1',
    fontSize: 14,
    marginBottom: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  label: {
    color: '#94A3B8',
    fontSize: 14,
  },
  value: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
  },
  logoutButton: {
    marginTop: 26,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
