import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { config } from '../config/env';

const LOCATION_TASK_NAME = 'background-location-task';
const QUEUE_KEY = '@telemetry_queue';

class TelemetryService {
  constructor() {
    this.socket = null;
    this.busData = null;
    this.isTracking = false;
    this.queue = [];
    this.lastSentTime = 0;
    this.intervalMs = 2500;
    this.isFlushing = false;
    
    // Auto-restore state for background resilience
    this.restoreState();
  }

  async restoreState() {
    try {
      const savedState = await AsyncStorage.getItem('@active_trip_state');
      if (savedState) {
        this.busData = JSON.parse(savedState);
        this.isTracking = true;
        console.log('🔄 Telemetry state restored from background');
        this.setupSocket();
        this.loadQueue();
      }
    } catch (e) {
      console.error('Failed to restore telemetry state:', e);
    }
  }

  init(busData) {
    this.busData = busData;
    this.setupSocket();
    this.loadQueue();
    // Ensure state is saved immediately on init
    AsyncStorage.setItem('@active_trip_state', JSON.stringify(busData)).catch(e => console.error(e));
  }

  setupSocket() {
    // Disabled Socket.io in driver app to fix background lifecycle crashes.
    // Vercel Serverless drops websockets, so we enforce pure HTTP REST for telemetry.
    console.log('Driver App: Relying entirely on HTTP Batch Telemetry for stable background tracking.');
  }

  async loadQueue() {
    try {
      const q = await AsyncStorage.getItem(QUEUE_KEY);
      if (q) {
        this.queue = JSON.parse(q);
      }
    } catch (e) {
      console.error('Failed to load telemetry queue:', e);
    }
  }

  async saveQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      // Ignore
    }
  }

  async flushQueue() {
    if (this.isFlushing || this.queue.length === 0) return;
    
    this.isFlushing = true;
    const batch = [...this.queue.slice(0, 20)]; // Process in batches of 20

    try {
      // Send batch to backend via REST (most reliable on serverless/Vercel)
      const response = await fetch(`${config.backendUrl}/api/update-location-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: batch })
      });

      if (response.ok) {
        // Safe splice to avoid dropping new packets that arrived while fetching
        this.queue.splice(0, batch.length);
      } else {
        throw new Error('Batch update failed');
      }
    } catch (e) {
      console.warn('Telemetry flush failed, will retry later:', e.message);
      // Don't modify queue, let it retry next time
    } finally {
      this.isFlushing = false;
      await this.saveQueue();
      
      // If we still have items, schedule another flush soon
      if (this.queue.length > 0) {
        setTimeout(() => this.flushQueue(), 5000);
      }
    }
  }

  enqueueTelemetry(packet) {
    this.queue.push(packet);
    if (this.queue.length > 100) { 
      this.queue.shift(); // Hard cap
    }
    this.saveQueue();
    
    // Force immediate flush for reliable tracking instead of waiting for 10 elements (25 seconds lag)
    this.flushQueue();
  }

  async startTracking() {
    if (!this.busData) throw new Error('Not initialized with bus data');

    try {
      // 1. Request Foreground Permissions First
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
          throw new Error('Location permission is required to track the bus. Please allow it in settings.');
      }

      // 2. Request Background Permissions (Important for lock screen)
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.warn('Background location permission not granted. Tracking may stop when the app is closed.');
      }

      // 3. Double-check Services (Android specific check for better debugging)
      const services = await Location.getProviderStatusAsync();
      if (!services.locationServicesEnabled) {
          throw new Error('Please turn on GPS/Location in your phone settings.');
      }

      // 4. Verification Check
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        throw new Error('Location services are reported as disabled by the system.');
      }

      // 5. Start Updates
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2500,
        distanceInterval: 0,
        deferredUpdatesInterval: 2500,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Bus tracking active',
          notificationBody: 'Transmitting telemetry to central server',
          notificationColor: '#FFD700',
        },
        pausesUpdatesAutomatically: false,
      });

      this.isTracking = true;
      await AsyncStorage.setItem('@active_trip_state', JSON.stringify(this.busData));
      
      console.log('✅ Tracking started successfully');
    } catch (e) {
      console.error('Failed to start tracking:', e.message);
      throw e;
    }
  }


  async stopTracking() {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (e) {
      console.error(e);
    }
    this.isTracking = false;
    await AsyncStorage.removeItem('@active_trip_state');
  }

  processLocation(location) {
    if (!this.isTracking || !this.busData) return;

    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const speedKmh = speed ? speed * 3.6 : 0;
    this.lastSpeed = speedKmh;

    // Adaptive battery protection
    // Updated to force exactly 2500ms intervals instead of 500ms burst firing
    const adaptiveInterval = 2500;
    
    const now = Date.now();
    if (now - this.lastSentTime < adaptiveInterval) {
      return; // Skip based on adaptive frequency
    }

    this.lastSentTime = now;

    const packet = {
      bus_id: this.busData.bus_id,
      tenant_id: this.busData.tenant_id,
      latitude,
      longitude,
      speed: speedKmh.toFixed(1),
      heading: heading || 0,
      accuracy,
      timestamp: location.timestamp || now
    };

    this.enqueueTelemetry(packet);
  }
}

const telemetryService = new TelemetryService();

// Global task definition
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocation] Task error:', error);
    return;
  }
  
  if (data) {
    // If telemetry service isn't ready, wait for restoration
    if (!telemetryService.isTracking) {
        await telemetryService.restoreState();
    }

    if (telemetryService.isTracking && telemetryService.busData) {
      const { locations } = data;
      if (locations && locations.length > 0) {
        // Process the most recent point
        telemetryService.processLocation(locations[locations.length - 1]);
      }
    }
  }
});

export default telemetryService;
