/** Background task that receives the phone's enter/exit events for each flat's circle. */
export const PRESENCE_TASK = 'flatapp-presence';

/** Background task that runs whenever the phone joins a Wi-Fi network (modules/flat-wifi). */
export const WIFI_TASK = 'flatapp-presence-wifi';

/**
 * A phone that joined the flat's Wi-Fi within this many days is a "Wi-Fi phone": entering the
 * circle no longer marks it Home, only joining the Wi-Fi does (unless its Wi-Fi is switched off).
 * After that long without joining, the circle counts again, so someone who forgot the network is
 * not stuck showing Out.
 */
export const WIFI_TRUST_DAYS = 14;

/**
 * Background task that sends any Home/Out still waiting and re-checks the phone's state. Android
 * (WorkManager) treats the interval as a minimum and runs it only while the phone is online.
 */
export const CHECKIN_TASK = 'flatapp-presence-checkin';
export const CHECKIN_MINUTES = 30;

/**
 * After this long without a check-in from a phone, its Home/Out shows as "Not sure". Generous on
 * purpose: Android's battery saving (Doze) can hold background work for several hours while a phone
 * lies still overnight, and that person is usually just asleep at home.
 */
export const STALE_AFTER_HOURS = 8;
