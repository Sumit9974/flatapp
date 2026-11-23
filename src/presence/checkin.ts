import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { CHECKIN_TASK } from './config';
import { flushPresence } from './report';
import { markCheckinRan, refreshPresence } from './sync';
import { reportWifiHome } from './wifi';

/**
 * About every 30 minutes, while the phone is online (WorkManager waits for a network):
 * 1. sends any Home/Out still waiting from a crossing whose call failed;
 * 2. re-reads the flats and re-registers their circles, which makes Android report whether the
 *    phone is inside or outside right now. The server records that as the latest check
 *    (checked_at), and a crossing Android missed corrects itself;
 * 3. confirms Home if the phone is on one of the flats' Wi-Fi networks.
 * Waking the app for this also brings back circles and the Wi-Fi watch after a phone restart.
 * Must be defined at module load (index.ts).
 */
TaskManager.defineTask(CHECKIN_TASK, async () => {
  markCheckinRan();
  try {
    await flushPresence();
    await refreshPresence();
    await reportWifiHome();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
