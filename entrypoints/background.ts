import { routeTabIfMatched } from '../lib/air-traffic-control';
import {
  deleteArchivedTab,
  restoreArchivedTab,
  runAutoArchive,
} from '../lib/auto-archive';
import {
  captureGroupHome,
  migrateGroupHomeTabId,
  removeGroupHome,
  resetGroupTabToHome,
  syncAllGroupedTabs,
  unloadTabGroup,
} from '../lib/group-home';
import { quickCopyActiveUrl } from '../lib/quick-copy';
import {
  clearAtcRouted,
  getArchivedTabs,
  getGroupHomes,
  getSettings,
  recordTabActivity,
  removeTabActivity,
  saveArchivedTabs,
} from '../lib/storage';
import { runTidyTabs } from '../lib/tidy-tabs';
import type {
  OtherWindowGroup,
  PopupOpenTab,
  PopupState,
  PopupTabGroup,
  RuntimeMessage,
  TabGroupColor,
} from '../lib/types';

const AUTO_ARCHIVE_ALARM = 'arkee-auto-archive';

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(AUTO_ARCHIVE_ALARM);
  if (!existing) {
    chrome.alarms.create(AUTO_ARCHIVE_ALARM, { periodInMinutes: 15 });
  }
}

async function buildPopupState(): Promise<PopupState> {
  const [settings, archivedTabs, groupRecords, lastWindow] = await Promise.all([
    getSettings(),
    getArchivedTabs(),
    getGroupHomes(),
    chrome.windows.getLastFocused(),
  ]);

  const [windowGroups, allGroups, windowTabs, allTabs] = await Promise.all([
    chrome.tabGroups.query({ windowId: lastWindow.id }),
    chrome.tabGroups.query({}),
    chrome.tabs.query({ windowId: lastWindow.id }),
    chrome.tabs.query({}),
  ]);

  const homeByTabId = new Map(groupRecords.map((r) => [r.tabId, r]));
  const groupInfoById = new Map(
    allGroups.map((g) => [
      g.id,
      {
        title: g.title || '(無題グループ)',
        color: (g.color as TabGroupColor) || 'grey',
      },
    ]),
  );

  const tabGroups: PopupTabGroup[] = windowGroups.map((group) => {
    const tabs = windowTabs
      .filter(
        (t): t is chrome.tabs.Tab & { id: number } =>
          t.id != null && t.groupId === group.id,
      )
      .map((t) => {
        const rec = homeByTabId.get(t.id);
        const currentUrl = t.url ?? '';
        return {
          tabId: t.id,
          title: t.title || currentUrl,
          currentUrl,
          homeUrl: rec?.homeUrl,
          favIconUrl: t.favIconUrl,
          isDrifted: Boolean(rec?.homeUrl && currentUrl && rec.homeUrl !== currentUrl),
          discarded: Boolean(t.discarded),
        };
      });

    return {
      groupId: group.id,
      title: group.title || '(無題グループ)',
      color: (group.color as TabGroupColor) || 'grey',
      collapsed: group.collapsed,
      tabs,
    };
  });

  const openTabs: PopupOpenTab[] = allTabs
    .filter((t): t is chrome.tabs.Tab & { id: number } => t.id != null)
    .map((t) => {
      const groupInfo =
        t.groupId != null && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
          ? groupInfoById.get(t.groupId)
          : undefined;
      return {
        tabId: t.id,
        windowId: t.windowId,
        title: t.title || t.url || 'Untitled',
        url: t.url ?? '',
        favIconUrl: t.favIconUrl,
        active: Boolean(t.active && t.windowId === lastWindow.id),
        discarded: Boolean(t.discarded),
        groupTitle: groupInfo?.title,
        groupColor: groupInfo?.color,
      };
    });

  const activeTab = windowTabs.find((t) => t.active);
  const activeTabId = activeTab?.id;
  const activeTabGroupId =
    activeTab?.groupId != null && activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
      ? activeTab.groupId
      : undefined;

  const ungroupedCount = windowTabs.filter(
    (t) =>
      !t.pinned &&
      t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE &&
      t.url &&
      (t.url.startsWith('http://') || t.url.startsWith('https://')),
  ).length;

  const otherWindowGroups: OtherWindowGroup[] = allGroups
    .filter((g) => g.windowId !== lastWindow.id)
    .map((g) => ({
      groupId: g.id,
      windowId: g.windowId,
      title: g.title || '(Untitled Group)',
      color: (g.color as TabGroupColor) || 'grey',
      tabCount: allTabs.filter((t) => t.groupId === g.id).length,
    }))
    .filter((g) => g.tabCount > 0);

  return {
    settings,
    archivedTabs,
    tabGroups,
    otherWindowGroups,
    openTabs,
    currentWindowId: lastWindow.id,
    activeTabId,
    activeTabGroupId,
    ungroupedCount,
  };
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureAlarm();
    void syncAllGroupedTabs();
  });

  chrome.runtime.onStartup.addListener(() => {
    void ensureAlarm();
    void syncAllGroupedTabs();
  });

  void ensureAlarm();

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_ARCHIVE_ALARM) {
      void runAutoArchive();
    }
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void recordTabActivity(tabId);
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id != null) {
      void recordTabActivity(tab.id);
    }
    if (tab.url) {
      void routeTabIfMatched(tab);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      void recordTabActivity(tabId);
    }

    if (changeInfo.groupId !== undefined) {
      void (async () => {
        if (changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
          await removeGroupHome(tabId);
          return;
        }
        const settings = await getSettings();
        if (settings.groupHome.enabled && settings.groupHome.autoCaptureOnGroup) {
          const existing = (await getGroupHomes()).find((r) => r.tabId === tabId);
          if (!existing) {
            await captureGroupHome(tab);
          }
        }
      })();
    }

    if (changeInfo.url) {
      void routeTabIfMatched(tab);
    }
  });

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    void migrateGroupHomeTabId(removedTabId, addedTabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void removeTabActivity(tabId);
    void removeGroupHome(tabId);
    void clearAtcRouted(tabId);
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'quick-copy-url') {
      void quickCopyActiveUrl();
    } else if (command === 'reset-group-tab') {
      void resetGroupTabToHome();
    } else if (command === 'tidy-tabs') {
      void runTidyTabs();
    }
  });

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse) => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return false;
      }

      if (message.type === 'OFFSCREEN_COPY') {
        return false;
      }

      void (async () => {
        try {
          switch (message.type) {
            case 'GET_POPUP_STATE':
              sendResponse(await buildPopupState());
              break;
            case 'QUICK_COPY_URL':
              sendResponse(await quickCopyActiveUrl());
              break;
            case 'RESET_GROUP_TAB':
              sendResponse(
                await resetGroupTabToHome(message.tabId, {
                  discard: message.discard,
                }),
              );
              break;
            case 'SET_GROUP_HOME': {
              const tab = await chrome.tabs.get(message.tabId);
              const rec = await captureGroupHome(tab, message.url);
              sendResponse({ ok: Boolean(rec), record: rec });
              break;
            }
            case 'UNLOAD_TAB_GROUP':
              sendResponse(await unloadTabGroup(message.groupId));
              break;
            case 'ADD_TAB_TO_GROUP': {
              let tabId = message.tabId;
              if (tabId == null) {
                const [active] = await chrome.tabs.query({
                  active: true,
                  lastFocusedWindow: true,
                });
                tabId = active?.id;
              }
              if (tabId == null) {
                sendResponse({ ok: false, error: 'アクティブなタブがありません' });
                break;
              }
              const tab = await chrome.tabs.get(tabId);
              if (tab.pinned) {
                sendResponse({
                  ok: false,
                  error: 'ピン留めタブはグループに追加できません',
                });
                break;
              }
              await chrome.tabs.group({ tabIds: [tabId], groupId: message.groupId });
              const updatedTab = await chrome.tabs.get(tabId);
              const settings = await getSettings();
              if (settings.groupHome.enabled && settings.groupHome.autoCaptureOnGroup) {
                await captureGroupHome(updatedTab);
              }
              sendResponse({ ok: true });
              break;
            }
            case 'CREATE_TAB_GROUP': {
              let tabId = message.tabId;
              if (tabId == null) {
                const [active] = await chrome.tabs.query({
                  active: true,
                  lastFocusedWindow: true,
                });
                tabId = active?.id;
              }
              if (tabId == null) {
                sendResponse({ ok: false, error: 'アクティブなタブがありません' });
                break;
              }
              const tab = await chrome.tabs.get(tabId);
              if (tab.pinned) {
                sendResponse({
                  ok: false,
                  error: 'ピン留めタブはグループに追加できません',
                });
                break;
              }
              const existingGroups = await chrome.tabGroups.query({
                windowId: tab.windowId,
              });
              const palette: TabGroupColor[] = [
                'blue',
                'purple',
                'green',
                'orange',
                'pink',
                'cyan',
                'yellow',
                'red',
                'grey',
              ];
              const color =
                message.color ?? palette[existingGroups.length % palette.length];
              const groupId = await chrome.tabs.group({
                tabIds: [tabId],
                createProperties: { windowId: tab.windowId },
              });
              await chrome.tabGroups.update(groupId, {
                title: message.title.trim() || 'New Group',
                color,
              });
              const updatedTab = await chrome.tabs.get(tabId);
              const settings = await getSettings();
              if (settings.groupHome.enabled && settings.groupHome.autoCaptureOnGroup) {
                await captureGroupHome(updatedTab);
              }
              sendResponse({ ok: true, groupId });
              break;
            }
            case 'UNGROUP_TAB': {
              let tabId = message.tabId;
              if (tabId == null) {
                const [active] = await chrome.tabs.query({
                  active: true,
                  lastFocusedWindow: true,
                });
                tabId = active?.id;
              }
              if (tabId == null) {
                sendResponse({ ok: false, error: 'アクティブなタブがありません' });
                break;
              }
              await chrome.tabs.ungroup([tabId]);
              await removeGroupHome(tabId);
              sendResponse({ ok: true });
              break;
            }
            case 'TOGGLE_GROUP_COLLAPSE': {
              const group = await chrome.tabGroups.get(message.groupId);
              await chrome.tabGroups.update(message.groupId, {
                collapsed: !group.collapsed,
              });
              sendResponse({ ok: true, collapsed: !group.collapsed });
              break;
            }
            case 'PULL_TAB_HERE': {
              const targetWindowId =
                message.targetWindowId ?? (await chrome.windows.getLastFocused()).id;
              if (targetWindowId == null) {
                sendResponse({ ok: false, error: '移動先ウィンドウが見つかりません' });
                break;
              }
              await chrome.tabs.move(message.tabId, {
                windowId: targetWindowId,
                index: -1,
              });
              await chrome.tabs.update(message.tabId, { active: true });
              await chrome.windows.update(targetWindowId, { focused: true });
              sendResponse({ ok: true });
              break;
            }
            case 'PULL_GROUP_HERE': {
              const targetWindowId =
                message.targetWindowId ?? (await chrome.windows.getLastFocused()).id;
              if (targetWindowId == null) {
                sendResponse({ ok: false, error: '移動先ウィンドウが見つかりません' });
                break;
              }
              await chrome.tabGroups.move(message.groupId, {
                windowId: targetWindowId,
                index: -1,
              });
              const groupTabs = await chrome.tabs.query({ groupId: message.groupId });
              if (groupTabs[0]?.id != null) {
                await chrome.tabs.update(groupTabs[0].id, { active: true });
              }
              await chrome.windows.update(targetWindowId, { focused: true });
              sendResponse({ ok: true });
              break;
            }
            case 'SWITCH_TO_TAB':
              await chrome.tabs.update(message.tabId, { active: true });
              await chrome.windows.update(message.windowId, { focused: true });
              sendResponse({ ok: true });
              break;
            case 'OPEN_URL':
              await chrome.tabs.create({ url: message.url, active: true });
              sendResponse({ ok: true });
              break;
            case 'TIDY_TABS':
              sendResponse(await runTidyTabs(message.windowId));
              break;
            case 'ARCHIVE_NOW':
              sendResponse({ archivedCount: await runAutoArchive({ force: true }) });
              break;
            case 'RESTORE_ARCHIVED_TAB':
              sendResponse({ ok: await restoreArchivedTab(message.id) });
              break;
            case 'DELETE_ARCHIVED_TAB':
              await deleteArchivedTab(message.id);
              sendResponse({ ok: true });
              break;
            case 'CLEAR_ARCHIVE':
              await saveArchivedTabs([]);
              sendResponse({ ok: true });
              break;
            default:
              sendResponse({ ok: false, error: 'Unknown message' });
          }
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();

      return true;
    },
  );
});
