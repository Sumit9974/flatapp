import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getCurrentSsid, isWifiEnabled, type WifiTaskData } from '../../modules/flat-wifi';
import { PRESENCE_TASK, WIFI_TASK } from './config';
import { reportPresence } from './report';
import { flatsOnCurrentWifi, reportWifiHome, usesFlatWifi } from './wifi';

interface GeofenceEventData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

/**
 * Android wakes the app for an enter/exit of a flat's circle (region identifier = flat id), and
 * also right after the circles are registered, to say whether the phone is inside or outside now.
 * Only "home" or "out" leaves the phone, never coordinates. Reports are queued first, so a failed
 * call is sent again later instead of being lost. Must be defined at module load (index.ts).
 *
 * The circle is at least 100 m, so it reaches past the building. Wi-Fi refines it:
 * - Out while the phone is still on the flat's Wi-Fi is GPS drift: it confirms Home instead.
 * - Entering the circle does not mark a phone Home if that phone uses the flat's Wi-Fi (joined it
 *   in the last two weeks) and has Wi-Fi switched on: joining the Wi-Fi will, a moment later.
 */
TaskManager.defineTask<GeofenceEventData>(PRESENCE_TASK, async ({ data, error }) => {
  if (error || !data?.region?.identifier) return;
  const flatId = data.region.identifier;
  const entered = data.eventType === Location.GeofencingEventType.Enter;
  const onFlatWifi = flatsOnCurrentWifi().includes(flatId);

  if (onFlatWifi) {
    await reportWifiHome();
    return;
  }
  if (!entered) {
    await reportPresence(flatId, 'out');
    return;
  }
  if (usesFlatWifi(flatId) && isWifiEnabled()) return;
  await reportPresence(flatId, 'home');
});

/**
 * The phone joined a Wi-Fi network (modules/flat-wifi), even with the app closed: Home for every
 * flat that lists it. Joining is never read as Out, and losing Wi-Fi is not watched at all: phones
 * drop Wi-Fi when the screen sleeps, so leaving is still the circle's job.
 */
TaskManager.defineTask<WifiTaskData>(WIFI_TASK, async ({ data, error }) => {
  if (error) return;
  await reportWifiHome(data?.ssid || getCurrentSsid());
});
