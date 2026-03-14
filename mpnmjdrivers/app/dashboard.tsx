import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import telemetryService from '../src/services/TelemetryService';

export default function DashboardScreen() {
  useKeepAwake(); // Keep screen awake while tracking

  const [busData, setBusData] = useState<any>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  const [currentSpeed, setCurrentSpeed] = useState<number | string>(0);
  const speedInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadBusData();
    return () => {
      if (speedInterval.current) clearInterval(speedInterval.current);
    };
  }, []);

  const loadBusData = async () => {
    try {
      const dataStr = await SecureStore.getItemAsync('busData');
      if (dataStr) {
        const parsedData = JSON.parse(dataStr);
        setBusData(parsedData);
        
        telemetryService.init(parsedData);

        // Auto-resume check
        const activeTrip = await AsyncStorage.getItem('@active_trip_state');
        if (activeTrip) {
          const tripData = JSON.parse(activeTrip);
          if (tripData.bus_id === parsedData.bus_id) {
            console.log("Resuming active trip...");
            await startTracking(parsedData);
          }
        }
      } else {
        router.replace('/');
      }
    } catch (e) {
      router.replace('/');
    }
  };

  const handleLogout = async () => {
    await stopTracking();
    await SecureStore.deleteItemAsync('busData');
    router.replace('/');
  };

  const startTracking = async (data = busData) => {
    if (!data) return;

    try {
      setLocationError(null);
      await telemetryService.startTracking();
      setIsTracking(true);

      // Poll speed for UI from the telemetry service
      if (speedInterval.current) clearInterval(speedInterval.current);
      speedInterval.current = setInterval(() => {
        setCurrentSpeed(Math.round(telemetryService.lastSpeed));
      }, 1000);

    } catch (err: any) {
      setIsTracking(false);
      setLocationError('Error starting tracking: ' + err.message);
      console.error(err);
    }
  };

  const stopTracking = async () => {
    try {
      await telemetryService.stopTracking();
    } catch(err) {
      console.error(err);
    }
    setIsTracking(false);
    setCurrentSpeed(0);
    if (speedInterval.current) clearInterval(speedInterval.current);
  };

  const toggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  if (!busData) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading data...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.busInfo}>{busData.bus_name || busData.bus_number}</Text>
          <Text style={styles.routeInfo}>Route: {busData.routes?.route_name || 'Unassigned'}</Text>
        </View>

        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Tracking Status</Text>
          <View style={[styles.statusIndicator, { backgroundColor: isTracking ? '#4CAF50' : '#F44336' }]} />
          <Text style={styles.statusText}>{isTracking ? 'Active' : 'Offline'}</Text>
        </View>

        <View style={styles.speedContainer}>
          <Text style={styles.speedValue}>{currentSpeed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>

        {locationError && <Text style={styles.errorText}>{locationError}</Text>}

        <View style={styles.controls}>
          <TouchableOpacity 
            style={[styles.mainButton, isTracking ? styles.stopButton : styles.startButton]}
            onPress={toggleTracking}
          >
            <Text style={styles.mainButtonText}>
              {isTracking ? 'STOP TRACKING' : 'START TRACKING'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  text: {
    color: '#FFF',
  },
  header: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: '#333',
    marginBottom: 40,
  },
  busInfo: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
  },
  routeInfo: {
    color: '#A0A0A0',
    fontSize: 16,
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 40,
  },
  statusLabel: {
    color: '#FFF',
    flex: 1,
    fontSize: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  speedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: '#333',
    alignSelf: 'center',
    marginBottom: 40,
  },
  speedValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  speedUnit: {
    fontSize: 18,
    color: '#A0A0A0',
  },
  controls: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  mainButton: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#FFD700',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  mainButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  logoutButton: {
    alignSelf: 'center',
    padding: 10,
  },
  logoutText: {
    color: '#FF5252',
    fontSize: 16,
  },
  errorText: {
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 20,
  }
});
