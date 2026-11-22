import {
  appendArchivedTabs,
  getArchivedTabs,
  getSettings,
  getTabActivityMap,
  removeTabActivity,
  saveArchivedTabs,
} from './storage';
import type { ArchivedTab, Settings } from './types';

export interface ArchivableTabLike {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
  active?: boolean;
  pinned?: boolean;
  audible?: boolean;
  groupId?: number;
  lastAccessed?: number;
}

const PROTECTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];

export function isArchivableTab(
  tab: ArchivableTabLike,
  settings: Settings['autoArchive'],
  lastActiveAt: number,
  now: number,
): boolean {
  if (tab.id == null || !tab.url) return false;
  if (tab.active || tab.pinned) return false;
  if (settings.excludeAudible && tab.audible) return false;
  if (settings.excludeGrouped && tab.groupId != null && tab.groupId !== -1) {
    return false;
  }
  if (PROTECTED_PREFIXES.some((prefix) => tab.url!.startsWith(prefix))) {
    return false;
  }

  const thresholdMs = Math.max(0.1, settings.idleHours) * 60 * 60 * 1000;
  return now - lastActiveAt >= thresholdMs;
}

export function searchArchivedTabs(
  tabs: ArchivedTab[],
  query: string,
): ArchivedTab[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return tabs;
  const terms = trimmed.split(/\s+/).filter(Boolean);
  return tabs.filter((tab) => {
    const haystack = `${tab.title} ${tab.url}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export async function runAutoArchive(
  options: { force?: boolean } = {},
): Promise<number> {
  const settings = await getSettings();
  if (!options.force && !settings.autoArchive.enabled) {
    return 0;
  }

  const now = Date.now();
  const [tabs, activityMap] = await Promise.all([
    chrome.tabs.query({}),
    getTabActivityMap(),
  ]);

  const toArchive: ArchivedTab[] = [];
  const tabIdsToClose: number[] = [];

  for (const tab of tabs) {
    if (tab.id == null) continue;
    const lastActiveAt =
      activityMap[String(tab.id)] ??
      (tab as ArchivableTabLike).lastAccessed ??
      now;

    if (isArchivableTab(tab, settings.autoArchive, lastActiveAt, now)) {
      toArchive.push({
        id: `${now}-${tab.id}-${Math.random().toString(36).slice(2, 7)}`,
        url: tab.url!,
        title: tab.title || tab.url!,
        favIconUrl: tab.favIconUrl,
        archivedAt: now,
        lastActiveAt,
      });
      tabIdsToClose.push(tab.id);
    }
  }

  if (toArchive.length === 0) return 0;

  await appendArchivedTabs(toArchive);
  await chrome.tabs.remove(tabIdsToClose);
  await Promise.all(tabIdsToClose.map((id) => removeTabActivity(id)));

  return toArchive.length;
}

export async function restoreArchivedTab(id: string): Promise<boolean> {
  const archived = await getArchivedTabs();
  const target = archived.find((t) => t.id === id);
  if (!target) return false;

  await chrome.tabs.create({ url: target.url, active: true });
  await saveArchivedTabs(archived.filter((t) => t.id !== id));
  return true;
}

export async function deleteArchivedTab(id: string): Promise<void> {
  const archived = await getArchivedTabs();
  await saveArchivedTabs(archived.filter((t) => t.id !== id));
}
