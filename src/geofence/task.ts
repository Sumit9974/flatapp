import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { notifyNow } from '../notify';
import { GEOFENCE_TASK } from './config';
import { lastKnownDetails } from './control';
import { formatTime } from './format';
import { addLogEntry } from './log';

interface GeofenceEventData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Must run at module load (imported from index.ts): when Android wakes the app in the
 * background for a geofence event, no screen is mounted, only this task.
 */
TaskManager.defineTask<GeofenceEventData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    await addLogEntry('error', { note: `Geofence task: ${error.message}` });
    return;
  }
  const entered = data.eventType === Location.GeofencingEventType.Enter;
  await addLogEntry(entered ? 'enter' : 'exit', await lastKnownDetails());
  try {
    await notifyNow(entered ? 'Arrived home' : 'Left home', `Detected at ${formatTime(Date.now())}`);
  } catch (notifyError: unknown) {
    await addLogEntry('error', { note: `Notification failed: ${messageOf(notifyError)}` });
  }
});
