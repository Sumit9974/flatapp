import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { EVENTS_CHANNEL_ID } from './geofence/config';
import { ensurePushChannel } from './push/push';

/**
 * Shows notifications even while the app is open (a flatmate's dinner change, a geofence test
 * event), and makes sure the "Flat updates" channel exists before the first push arrives.
 */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  ensurePushChannel().catch(() => undefined);
}

async function ensureEventsChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(EVENTS_CHANNEL_ID, {
    name: 'Home and away events',
    // Exported at runtime via `export *` from NotificationChannelManager.types; eslint-plugin-import
    // cannot parse that file's comment-prefixed export, so it reports a false "not found".
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function notifyNow(title: string, body: string): Promise<void> {
  await ensureEventsChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { channelId: EVENTS_CHANNEL_ID },
  });
}
