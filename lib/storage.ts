import {
  type ArchivedTab,
  DEFAULT_SETTINGS,
  type GroupHomeRecord,
  type Settings,
} from './types';

const KEYS = {
  SETTINGS: 'arkee_settings',
  ARCHIVE: 'arkee_archived_tabs',
  GROUP_HOMES: 'arkee_group_homes',
  TAB_ACTIVITY: 'arkee_tab_activity',
  ATC_ROUTED: 'arkee_atc_routed',
} as const;

const MAX_ARCHIVE_ITEMS = 2000;

function mergeSettings(raw: Partial<Settings> | undefined): Settings {
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  return {
    autoArchive: { ...DEFAULT_SETTINGS.autoArchive, ...raw.autoArchive },
    groupHome: { ...DEFAULT_SETTINGS.groupHome, ...raw.groupHome },
    quickCopy: { ...DEFAULT_SETTINGS.quickCopy, ...raw.quickCopy },
    atc: {
      enabled: raw.atc?.enabled ?? DEFAULT_SETTINGS.atc.enabled,
      rules: raw.atc?.rules ?? DEFAULT_SETTINGS.atc.rules,
    },
    tidyTabs: { ...DEFAULT_SETTINGS.tidyTabs, ...raw.tidyTabs },
  };
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return mergeSettings(result[KEYS.SETTINGS] as Partial<Settings> | undefined);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
}

export async function getArchivedTabs(): Promise<ArchivedTab[]> {
  const result = await chrome.storage.local.get(KEYS.ARCHIVE);
  return (result[KEYS.ARCHIVE] as ArchivedTab[] | undefined) ?? [];
}

export async function saveArchivedTabs(tabs: ArchivedTab[]): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.ARCHIVE]: tabs.slice(0, MAX_ARCHIVE_ITEMS),
  });
}

export async function appendArchivedTabs(newItems: ArchivedTab[]): Promise<void> {
  if (newItems.length === 0) return;
  const existing = await getArchivedTabs();
  const seen = new Set(newItems.map((item) => item.url));
  const merged = [...newItems, ...existing.filter((item) => !seen.has(item.url))].slice(
    0,
    MAX_ARCHIVE_ITEMS,
  );
  await saveArchivedTabs(merged);
}

export async function getGroupHomes(): Promise<GroupHomeRecord[]> {
  const result = await chrome.storage.local.get(KEYS.GROUP_HOMES);
  return (result[KEYS.GROUP_HOMES] as GroupHomeRecord[] | undefined) ?? [];
}

export async function saveGroupHomes(records: GroupHomeRecord[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.GROUP_HOMES]: records });
}

export async function getTabActivityMap(): Promise<Record<string, number>> {
  const result = await chrome.storage.session.get(KEYS.TAB_ACTIVITY);
  return (result[KEYS.TAB_ACTIVITY] as Record<string, number> | undefined) ?? {};
}

export async function recordTabActivity(
  tabId: number,
  timestamp = Date.now(),
): Promise<void> {
  const map = await getTabActivityMap();
  map[String(tabId)] = timestamp;
  await chrome.storage.session.set({ [KEYS.TAB_ACTIVITY]: map });
}

export async function removeTabActivity(tabId: number): Promise<void> {
  const map = await getTabActivityMap();
  if (String(tabId) in map) {
    delete map[String(tabId)];
    await chrome.storage.session.set({ [KEYS.TAB_ACTIVITY]: map });
  }
}

export async function getAtcRoutedSet(): Promise<Record<string, string>> {
  const result = await chrome.storage.session.get(KEYS.ATC_ROUTED);
  return (result[KEYS.ATC_ROUTED] as Record<string, string> | undefined) ?? {};
}

export async function markAtcRouted(tabId: number, ruleId: string): Promise<void> {
  const routed = await getAtcRoutedSet();
  routed[String(tabId)] = ruleId;
  await chrome.storage.session.set({ [KEYS.ATC_ROUTED]: routed });
}

export async function clearAtcRouted(tabId: number): Promise<void> {
  const routed = await getAtcRoutedSet();
  if (String(tabId) in routed) {
    delete routed[String(tabId)];
    await chrome.storage.session.set({ [KEYS.ATC_ROUTED]: routed });
  }
}
