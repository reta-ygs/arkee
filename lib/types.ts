export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export const TAB_GROUP_COLORS: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
];

export type AtcMatchType = 'glob' | 'regex';

export interface AtcRule {
  id: string;
  name: string;
  pattern: string;
  matchType: AtcMatchType;
  groupTitle: string;
  groupColor: TabGroupColor;
  enabled: boolean;
}

export type AiBackendMode = 'auto' | 'builtin' | 'byok' | 'domain';
export type ByokProvider = 'openai' | 'gemini' | 'claude';

export interface Settings {
  autoArchive: {
    enabled: boolean;
    /** Idle threshold in hours before an ungrouped tab is archived */
    idleHours: number;
    excludeGrouped: boolean;
    excludeAudible: boolean;
  };
  groupHome: {
    enabled: boolean;
    autoCaptureOnGroup: boolean;
    discardOnReset: boolean;
  };
  quickCopy: {
    cleanTrackingParams: boolean;
    extraStripParams: string[];
    showPageToast: boolean;
  };
  atc: {
    enabled: boolean;
    rules: AtcRule[];
  };
  tidyTabs: {
    mode: AiBackendMode;
    byokProvider: ByokProvider;
    byokApiKey: string;
    byokModel: string;
    customHint: string;
    minTabsPerGroup: number;
  };
}

export interface ArchivedTab {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  archivedAt: number;
  lastActiveAt: number;
}

export interface GroupHomeRecord {
  tabId: number;
  groupId: number;
  windowId: number;
  index: number;
  homeUrl: string;
  title: string;
  favIconUrl?: string;
  capturedAt: number;
}

export interface TidyGroupSuggestion {
  title: string;
  color: TabGroupColor;
  tabIds: number[];
}

export interface TidyResult {
  engine: 'builtin' | 'byok' | 'domain';
  groupsCreated: number;
  tabsGrouped: number;
  note?: string;
}

export interface CopyResult {
  ok: boolean;
  url?: string;
  cleaned?: boolean;
  error?: string;
}

export interface GroupResetResult {
  ok: boolean;
  homeUrl?: string;
  discarded?: boolean;
  error?: string;
}

export interface GroupUnloadResult {
  ok: boolean;
  unloadedCount: number;
  error?: string;
}

export type RuntimeMessage =
  | { type: 'QUICK_COPY_URL' }
  | { type: 'RESET_GROUP_TAB'; tabId?: number; discard?: boolean }
  | { type: 'SET_GROUP_HOME'; tabId: number; url?: string }
  | { type: 'UNLOAD_TAB_GROUP'; groupId: number }
  | { type: 'ADD_TAB_TO_GROUP'; tabId?: number; groupId: number }
  | { type: 'CREATE_TAB_GROUP'; tabId?: number; title: string; color?: TabGroupColor }
  | { type: 'UNGROUP_TAB'; tabId?: number }
  | { type: 'TOGGLE_GROUP_COLLAPSE'; groupId: number }
  | { type: 'PULL_TAB_HERE'; tabId: number; targetWindowId?: number }
  | { type: 'PULL_GROUP_HERE'; groupId: number; targetWindowId?: number }
  | { type: 'SWITCH_TO_TAB'; tabId: number; windowId: number }
  | { type: 'OPEN_URL'; url: string }
  | { type: 'TIDY_TABS'; windowId?: number }
  | { type: 'ARCHIVE_NOW' }
  | { type: 'RESTORE_ARCHIVED_TAB'; id: string }
  | { type: 'DELETE_ARCHIVED_TAB'; id: string }
  | { type: 'CLEAR_ARCHIVE' }
  | { type: 'GET_POPUP_STATE' }
  | { type: 'OFFSCREEN_COPY'; text: string };

export interface PopupOpenTab {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  discarded: boolean;
  groupTitle?: string;
  groupColor?: TabGroupColor;
}

export interface PopupGroupedTab {
  tabId: number;
  title: string;
  currentUrl: string;
  homeUrl?: string;
  favIconUrl?: string;
  isDrifted: boolean;
  discarded: boolean;
}

export interface PopupTabGroup {
  groupId: number;
  title: string;
  color: TabGroupColor;
  collapsed: boolean;
  tabs: PopupGroupedTab[];
}

export interface OtherWindowGroup {
  groupId: number;
  windowId: number;
  title: string;
  color: TabGroupColor;
  tabCount: number;
}

export interface PopupState {
  settings: Settings;
  archivedTabs: ArchivedTab[];
  tabGroups: PopupTabGroup[];
  otherWindowGroups: OtherWindowGroup[];
  openTabs: PopupOpenTab[];
  currentWindowId?: number;
  activeTabId?: number;
  activeTabGroupId?: number;
  ungroupedCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autoArchive: {
    enabled: true,
    idleHours: 12,
    excludeGrouped: true,
    excludeAudible: true,
  },
  groupHome: {
    enabled: true,
    autoCaptureOnGroup: true,
    discardOnReset: true,
  },
  quickCopy: {
    cleanTrackingParams: true,
    extraStripParams: [],
    showPageToast: true,
  },
  atc: {
    enabled: true,
    rules: [
      {
        id: 'default-github',
        name: 'GitHub',
        pattern: '*://github.com/*',
        matchType: 'glob',
        groupTitle: 'Dev',
        groupColor: 'purple',
        enabled: false,
      },
      {
        id: 'default-docs',
        name: 'Google Docs',
        pattern: '*://docs.google.com/*',
        matchType: 'glob',
        groupTitle: 'Docs',
        groupColor: 'blue',
        enabled: false,
      },
    ],
  },
  tidyTabs: {
    mode: 'auto',
    byokProvider: 'gemini',
    byokApiKey: '',
    byokModel: '',
    customHint: '',
    minTabsPerGroup: 2,
  },
};
