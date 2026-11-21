import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../lib/supabase';

export const PRESENCE_TASK = 'flatapp-presence';

interface GeofenceEventData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

/**
 * Android wakes the app for an enter/exit of a flat's circle (region identifier = flat id).
 * Only "home" or "out" leaves the phone: never coordinates. Must be defined at module load.
 */
TaskManager.defineTask<GeofenceEventData>(PRESENCE_TASK, async ({ data, error }) => {
  if (error || !data?.region?.identifier) return;
  const state = data.eventType === Location.GeofencingEventType.Enter ? 'home' : 'out';
  await supabase.rpc('report_presence', { p_flat: data.region.identifier, p_state: state });
});
