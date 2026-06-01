import { writable, derived } from 'svelte/store';

// Safely check for window object in case of SSR
const isBrowser = typeof window !== 'undefined';

export const token = writable(isBrowser ? (localStorage.getItem('piq_token') || '') : '');
export const theme = writable(isBrowser ? (localStorage.getItem('piq_theme') || 'dark') : 'dark');
export const alerts = writable([]);
export const sites = writable([]);

// UI State
export const toast = writable({ visible: false, message: '', type: 'success' });
export const serverStatus = writable('connected');
export const isSyncing = writable(false);

// Derived State
export const latestAlertIds = derived(alerts, $alerts => {
  const map = new Map();
  $alerts.forEach(a => {
    if (!map.has(a.site_id) || new Date(a.created_at) > new Date(map.get(a.site_id).created_at)) {
      map.set(a.site_id, a);
    }
  });
  return new Set(Array.from(map.values()).map(a => a.id));
});

export const liveFeedAlerts = derived(alerts, $alerts => $alerts.filter(a => !a.is_read));
export const archivedAlerts = derived(alerts, $alerts => $alerts.filter(a => a.is_read));

export const unreadCounts = derived(alerts, $alerts => 
  $alerts.filter(a => !a.is_read).reduce((acc, a) => { 
    acc[a.site_id] = (acc[a.site_id] || 0) + 1; 
    return acc; 
  }, {})
);

export const groupedLiveFeed = derived(alerts, $alerts => 
  Object.values(
    $alerts.filter(a => !a.is_read).reduce((acc, alert) => {
      const dayKey = new Date(alert.created_at).toDateString();
      const groupKey = `${alert.site_id}_${dayKey}`;
      if (!acc[groupKey]) {
        acc[groupKey] = { ...alert, thread: [] };
      } else {
        acc[groupKey].thread.push(alert);
      }
      return acc;
    }, {})
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
);

// sortedSites requires combining both $sites and $alerts
export const sortedSites = derived([sites, alerts], ([$sites, $alerts]) => {
  return [...$sites].sort((a, b) => {
    const aAlert = $alerts.find(al => al.site_id === a.id);
    const bAlert = $alerts.find(al => al.site_id === b.id);
    const aTime = aAlert ? new Date(aAlert.created_at).getTime() : 0;
    const bTime = bAlert ? new Date(bAlert.created_at).getTime() : 0;
    return bTime - aTime;
  });
});

// Automatically sync these stores to localStorage whenever they change
if (isBrowser) {
  theme.subscribe(value => {
    localStorage.setItem('piq_theme', value);
  });

  token.subscribe(value => {
    if (value) {
      localStorage.setItem('piq_token', value);
    } else {
      localStorage.removeItem('piq_token');
    }
  });
}
