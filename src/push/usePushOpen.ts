import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { useFlats } from '../flats/FlatProvider';
import { useNav } from '../nav/NavProvider';
import { routeForTarget } from '../nav/routes';

// Module-level on purpose: the shell remounts when the flat changes, and a tapped notification must
// be handled once, not again by the new shell.
const handled = new Set<string>();
const pending: { flatId: string | null; target: string | null } = { flatId: null, target: null };

function readData(response: Notifications.NotificationResponse): { flatId: string | null; target: string | null } {
  const request = response.notification.request;
  const content = (request.content.data ?? {}) as Record<string, unknown>;
  const trigger = request.trigger as { remoteMessage?: { data?: Record<string, unknown> | null } } | null;
  const remote = trigger?.remoteMessage?.data ?? {};
  const pick = (key: string): string | null => {
    const value = content[key] ?? remote[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  return { flatId: pick('flat_id'), target: pick('target') };
}

/** Tapping a phone notification opens the screen it is about, switching flat first if needed. */
export function usePushOpen(): void {
  const response = Notifications.useLastNotificationResponse();
  const { navigate } = useNav();
  const { current, memberships, selectFlat } = useFlats();
  const currentId = current?.flat.id ?? null;

  // After switching flat for a tapped notification the shell starts fresh on Home; finish the trip.
  useEffect(() => {
    if (pending.flatId === null || pending.flatId !== currentId) return;
    const route = routeForTarget(pending.target);
    pending.flatId = null;
    pending.target = null;
    if (route) navigate(route);
  }, [currentId, navigate]);

  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    const { flatId, target } = readData(response);
    if (flatId !== null && flatId !== currentId && memberships.some((m) => m.flat.id === flatId)) {
      pending.flatId = flatId;
      pending.target = target;
      selectFlat(flatId);
      return;
    }
    const route = routeForTarget(target);
    if (route) navigate(route);
  }, [response, currentId, memberships, navigate, selectFlat]);
}
