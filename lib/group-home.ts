import { getGroupHomes, getSettings, saveGroupHomes } from './storage';
import type {
  GroupHomeRecord,
  GroupResetResult,
  GroupUnloadResult,
} from './types';

function isTrackableUrl(url: string | undefined): url is string {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

function isGroupedTab(tab: chrome.tabs.Tab): boolean {
  return tab.groupId != null && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
}

export async function captureGroupHome(
  tab: chrome.tabs.Tab,
  overrideUrl?: string,
): Promise<GroupHomeRecord | null> {
  const url = overrideUrl ?? tab.url;
  if (tab.id == null || !isGroupedTab(tab) || !isTrackableUrl(url)) return null;

  const records = await getGroupHomes();
  const next: GroupHomeRecord = {
    tabId: tab.id,
    groupId: tab.groupId,
    windowId: tab.windowId,
    index: tab.index,
    homeUrl: url,
    title: tab.title || url,
    favIconUrl: tab.favIconUrl,
    capturedAt: Date.now(),
  };

  const filtered = records.filter((r) => r.tabId !== tab.id);
  filtered.push(next);
  await saveGroupHomes(filtered);
  return next;
}

export async function removeGroupHome(tabId: number): Promise<void> {
  const records = await getGroupHomes();
  const filtered = records.filter((r) => r.tabId !== tabId);
  if (filtered.length !== records.length) {
    await saveGroupHomes(filtered);
  }
}

export async function migrateGroupHomeTabId(
  oldTabId: number,
  newTabId: number,
): Promise<void> {
  if (oldTabId === newTabId) return;
  const records = await getGroupHomes();
  let changed = false;
  const updated = records.map((r) => {
    if (r.tabId === oldTabId) {
      changed = true;
      return { ...r, tabId: newTabId };
    }
    return r;
  });
  if (changed) {
    await saveGroupHomes(updated);
  }
}

export async function syncAllGroupedTabs(): Promise<void> {
  const settings = await getSettings();
  if (!settings.groupHome.enabled) return;

  const [allTabs, records] = await Promise.all([
    chrome.tabs.query({}),
    getGroupHomes(),
  ]);

  const groupedTabs = allTabs.filter(isGroupedTab);
  const byTabId = new Map(records.map((r) => [r.tabId, r]));
  const updated: GroupHomeRecord[] = [];

  for (const tab of groupedTabs) {
    if (tab.id == null || !isTrackableUrl(tab.url)) continue;
    const existing =
      byTabId.get(tab.id) ??
      records.find(
        (r) =>
          r.windowId === tab.windowId &&
          r.groupId === tab.groupId &&
          r.index === tab.index,
      );

    if (existing) {
      updated.push({
        ...existing,
        tabId: tab.id,
        groupId: tab.groupId,
        windowId: tab.windowId,
        index: tab.index,
        favIconUrl: tab.favIconUrl ?? existing.favIconUrl,
      });
    } else if (settings.groupHome.autoCaptureOnGroup) {
      updated.push({
        tabId: tab.id,
        groupId: tab.groupId,
        windowId: tab.windowId,
        index: tab.index,
        homeUrl: tab.url,
        title: tab.title || tab.url,
        favIconUrl: tab.favIconUrl,
        capturedAt: Date.now(),
      });
    }
  }

  await saveGroupHomes(updated);
}

function waitForNavigationCommit(
  tabId: number,
  targetUrl: string,
  timeoutMs = 2500,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };

    const onUpdated = (
      updatedId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedId !== tabId) return;
      if (changeInfo.url === targetUrl || changeInfo.status === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function focusTabOutside(
  windowId: number,
  excludeTabIds: Set<number>,
): Promise<boolean> {
  const tabs = await chrome.tabs.query({ windowId });
  const candidates = tabs.filter(
    (t) => t.id != null && !excludeTabIds.has(t.id),
  );
  if (candidates.length === 0) return false;

  const preferred =
    candidates.find((t) => !isGroupedTab(t) && !t.discarded) ??
    candidates.find((t) => !t.discarded) ??
    candidates[0];

  if (preferred?.id == null) return false;
  await chrome.tabs.update(preferred.id, { active: true });
  return true;
}

export async function resetGroupTabToHome(
  explicitTabId?: number,
  options?: { discard?: boolean },
): Promise<GroupResetResult> {
  let targetTab: chrome.tabs.Tab | undefined;

  if (explicitTabId != null) {
    try {
      targetTab = await chrome.tabs.get(explicitTabId);
    } catch {
      return { ok: false, error: 'Tab not found' };
    }
  } else {
    const [active] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    targetTab = active;
  }

  if (!targetTab || targetTab.id == null) {
    return { ok: false, error: 'アクティブなタブが見つかりません' };
  }
  if (!isGroupedTab(targetTab)) {
    return { ok: false, error: 'タブグループ内のタブではありません' };
  }

  const [records, settings] = await Promise.all([
    getGroupHomes(),
    getSettings(),
  ]);
  const record = records.find((r) => r.tabId === targetTab!.id);
  const homeUrl = record?.homeUrl ?? targetTab.url;

  if (!record) {
    await captureGroupHome(targetTab);
  }

  const shouldDiscard = options?.discard ?? settings.groupHome.discardOnReset;

  if (homeUrl && targetTab.url !== homeUrl) {
    const commitWait = shouldDiscard
      ? waitForNavigationCommit(targetTab.id, homeUrl)
      : null;
    await chrome.tabs.update(targetTab.id, { url: homeUrl });
    if (commitWait) {
      await commitWait;
    }
  }

  let discarded = false;
  if (shouldDiscard) {
    try {
      const refreshed = await chrome.tabs.get(targetTab.id);
      if (refreshed.discarded) {
        discarded = true;
      } else {
        const canDiscard =
          !refreshed.active ||
          (await focusTabOutside(refreshed.windowId, new Set([targetTab.id])));

        if (!canDiscard) {
          return {
            ok: true,
            homeUrl,
            discarded: false,
            error: '他に切り替え先タブがないため休眠をスキップしました',
          };
        }

        const discardedTab = await chrome.tabs.discard(targetTab.id);
        if (discardedTab?.id != null && discardedTab.id !== targetTab.id) {
          await migrateGroupHomeTabId(targetTab.id, discardedTab.id);
        }
        discarded = true;
      }
    } catch (err) {
      return {
        ok: true,
        homeUrl,
        discarded: false,
        error: `休眠に失敗しました (${err instanceof Error ? err.message : String(err)})`,
      };
    }
  }

  return { ok: true, homeUrl, discarded };
}

export async function unloadTabGroup(groupId: number): Promise<GroupUnloadResult> {
  const tabs = await chrome.tabs.query({ groupId });
  const targetTabs = tabs.filter(
    (t): t is chrome.tabs.Tab & { id: number } => t.id != null,
  );
  if (targetTabs.length === 0) {
    return { ok: false, unloadedCount: 0, error: 'グループにタブがありません' };
  }

  const activeInGroup = targetTabs.find((t) => t.active);
  if (activeInGroup) {
    const exclude = new Set(targetTabs.map((t) => t.id));
    await focusTabOutside(activeInGroup.windowId, exclude);
  }

  let unloadedCount = 0;
  for (const tab of targetTabs) {
    const res = await resetGroupTabToHome(tab.id, { discard: true });
    if (res.ok && res.discarded) {
      unloadedCount++;
    }
  }

  // Collapse the group for a clean Arc-like "folded folder" feel
  try {
    await chrome.tabGroups.update(groupId, { collapsed: true });
  } catch {
    // Ignore if group can't be collapsed (e.g. still holds active tab)
  }

  return { ok: true, unloadedCount };
}
