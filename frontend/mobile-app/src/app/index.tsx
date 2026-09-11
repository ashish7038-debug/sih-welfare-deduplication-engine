import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const [email, setEmail] = useState('ashish@roadsense.in');
  const [password, setPassword] = useState('admin123');

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Login required', 'Please enter your email and password.');
      return;
    }

    router.replace('/dashboard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundGlow} />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>RoadSense</Text>
        <Text style={styles.title}>Field inspection portal</Text>
        <Text style={styles.subtitle}>Track road defects, GPS checks, live scans, and daily work logs.</Text>

        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>AI inspection system online</Text>
        </View>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#94A3B8"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#94A3B8"
          secureTextEntry
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
          <Text style={styles.primaryButtonText}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/dashboard')}>
          <Text style={styles.secondaryButtonText}>Continue as guest</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backgroundGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(33,150,243,0.18)',
    top: 80,
    right: -40,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.25)',
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  eyebrow: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 12,
  },
  subtitle: {
    color: '#D1D5DB',
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 8,
  },
  statusText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#F8FAFC',
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#7DD3FC',
    fontWeight: '700',
  },
});