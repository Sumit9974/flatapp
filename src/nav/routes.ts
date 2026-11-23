/** Every screen in the app. Top-level ones reset the stack and show the bottom tabs. */
export type Route =
  | { name: 'home' }
  | { name: 'bills' }
  | { name: 'dinner' }
  | { name: 'buy' }
  | { name: 'presence' }
  | { name: 'flatInfo' }
  | { name: 'notices' }
  | { name: 'polls' }
  | { name: 'repairs' }
  | { name: 'members' }
  | { name: 'settings' }
  | { name: 'billDetail'; id: string }
  | { name: 'addBill'; month: string }
  | { name: 'recurring' }
  | { name: 'recurringEdit'; id?: string }
  | { name: 'proposeBuy' }
  | { name: 'notifications' }
  | { name: 'flatInfoEdit' }
  | { name: 'pollNew' }
  | { name: 'repairNew' }
  | { name: 'homePin' }
  | { name: 'changePassword' }
  | { name: 'addFlat' }
  | { name: 'geofenceTest' };

export type RouteName = Route['name'];

export const TOP_LEVEL: ReadonlySet<RouteName> = new Set<RouteName>([
  'home',
  'bills',
  'dinner',
  'buy',
  'presence',
  'flatInfo',
  'notices',
  'polls',
  'repairs',
  'members',
  'settings',
]);

export const TABS = ['home', 'bills', 'dinner', 'buy'] as const;

export const TITLES: Record<RouteName, string> = {
  home: 'Home',
  bills: 'Bills',
  dinner: 'Dinner tonight',
  buy: 'Buy list',
  presence: "Who's home",
  flatInfo: 'Flat info',
  notices: 'Notice board',
  polls: 'Polls',
  repairs: 'Repairs',
  members: 'Members and invite',
  settings: 'Settings',
  billDetail: 'Bill',
  addBill: 'Add a bill',
  recurring: 'Recurring bills',
  recurringEdit: 'Recurring bill',
  proposeBuy: 'Propose a buy',
  notifications: 'Notifications',
  flatInfoEdit: 'Edit flat info',
  pollNew: 'Start a poll',
  repairNew: 'Report a repair',
  homePin: 'Home pin and radius',
  changePassword: 'Change password',
  addFlat: 'Add a flat',
  geofenceTest: 'Geofence test',
};

/** Where a notification's `target` ("bill:<id>", "dinner", …) leads. */
export function routeForTarget(target: string | null): Route | null {
  if (!target) return null;
  if (target.startsWith('bill:')) return { name: 'billDetail', id: target.slice(5) };
  switch (target) {
    case 'dinner':
      return { name: 'dinner' };
    case 'buy':
      return { name: 'buy' };
    case 'notices':
      return { name: 'notices' };
    case 'polls':
      return { name: 'polls' };
    case 'repairs':
      return { name: 'repairs' };
    case 'presence':
      return { name: 'presence' };
    case 'members':
      return { name: 'members' };
    default:
      return null;
  }
}
