import type { PopupState, TabGroupColor } from './types';

export type PaletteItemKind = 'tab' | 'action' | 'archive' | 'open-url';

export type PaletteActionId =
  | 'copy-url'
  | 'reset-group-tab'
  | 'set-group-home'
  | 'tidy-tabs'
  | 'archive-now'
  | 'open-options'
  | 'create-group'
  | 'ungroup-active-tab'
  | `create-group:${string}`
  | `add-to-group:${number}`
  | `toggle-collapse:${number}`
  | `unload-group:${number}`
  | `pull-tab:${number}`
  | `pull-group:${number}`;

export interface PaletteItem {
  id: string;
  kind: PaletteItemKind;
  title: string;
  subtitle: string;
  keywords?: string;
  favIconUrl?: string;
  groupTitle?: string;
  groupColor?: TabGroupColor;
  badge?: string;
  isOtherWindow?: boolean;
  tabId?: number;
  windowId?: number;
  archiveId?: string;
  actionId?: PaletteActionId;
  targetUrl?: string;
}

function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function extractInlineNewGroupName(text: string): string | null {
  const match = text.match(
    /^(?:new\s+group|new|create\s+group|create|group|新規|作成|グループ作成)\s+(.+)$/i,
  );
  return match?.[1]?.trim() || null;
}

function scoreMatch(item: PaletteItem, terms: string[]): number {
  const title = item.title.toLowerCase();
  const subtitle = item.subtitle.toLowerCase();
  const extra = `${item.keywords ?? ''} ${item.groupTitle ?? ''}`.toLowerCase();
  const haystack = `${title} ${subtitle} ${extra}`;

  for (const term of terms) {
    if (!haystack.includes(term)) return -1;
  }

  let score = 10;
  const joined = terms.join(' ');
  if (title === joined) score += 100;
  else if (title.startsWith(joined)) score += 60;
  else if (title.includes(joined)) score += 35;

  if (item.kind === 'action') score += 9;
  else if (item.kind === 'tab') score += 8;
  else if (item.kind === 'archive') score += 2;

  return score;
}

export function buildPaletteItems(state: PopupState, rawQuery: string): PaletteItem[] {
  const trimmed = rawQuery.trim();
  let scope: 'all' | 'action' | 'tab' | 'archive' = 'all';
  let searchText = trimmed;

  if (trimmed.startsWith('>')) {
    scope = 'action';
    searchText = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('@')) {
    scope = 'tab';
    searchText = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('#')) {
    scope = 'archive';
    searchText = trimmed.slice(1).trim();
  }

  const inlineGroupName = extractInlineNewGroupName(searchText);

  const actions: PaletteItem[] = [
    ...(inlineGroupName
      ? [
          {
            id: `act:create-group:${inlineGroupName}`,
            kind: 'action' as const,
            title: `Create New Tab Group: "${inlineGroupName}"`,
            subtitle: 'Create a new Chrome tab group with the current tab',
            keywords: `new create group tab 新規 作成 タブグループ ${inlineGroupName}`,
            badge: 'New Group',
            actionId: `create-group:${inlineGroupName}` as PaletteActionId,
          },
        ]
      : []),
    {
      id: 'act:create-group',
      kind: 'action',
      title: 'Create New Tab Group',
      subtitle: 'Create a new Chrome tab group with the current tab',
      keywords: 'new create tab group 新規 作成 タブグループ 作る',
      badge: 'Group',
      actionId: 'create-group',
    },
    ...state.tabGroups
      .filter((g) => g.groupId !== state.activeTabGroupId)
      .map((g) => ({
        id: `act:add-to-group:${g.groupId}`,
        kind: 'action' as const,
        title: `Add Tab to Group: ${g.title}`,
        subtitle: `Move current tab to "${g.title}" and remember home URL`,
        keywords: `add move tab group 追加 移動 タブグループ に入れる ${g.title}`,
        groupTitle: g.title,
        groupColor: g.color,
        badge: 'Add',
        actionId: `add-to-group:${g.groupId}` as PaletteActionId,
      })),
    ...(state.activeTabGroupId != null
      ? [
          {
            id: 'act:ungroup-active-tab',
            kind: 'action' as const,
            title: 'Remove Tab from Group',
            subtitle: 'Ungroup the current tab into a regular tab',
            keywords: 'ungroup remove leave tab group タブグループ 外す 解除 出す',
            badge: 'Group',
            actionId: 'ungroup-active-tab' as PaletteActionId,
          },
        ]
      : []),
    {
      id: 'act:copy-url',
      kind: 'action',
      title: 'Copy Clean URL',
      subtitle: 'Strip tracking params from current URL and copy',
      keywords: 'copy url clipboard clean コピー',
      badge: 'Action',
      actionId: 'copy-url',
    },
    {
      id: 'act:reset-group-tab',
      kind: 'action',
      title: 'Reset & Sleep Tab',
      subtitle: 'Reset grouped tab to home URL and unload from memory',
      keywords: 'reset sleep discard home group 休眠 戻す リセット',
      badge: 'Action',
      actionId: 'reset-group-tab',
    },
    {
      id: 'act:set-group-home',
      kind: 'action',
      title: 'Set Current URL as Home',
      subtitle: 'Overwrite the home URL for this grouped tab',
      keywords: 'home url set update 上書き ホーム',
      badge: 'Action',
      actionId: 'set-group-home',
    },
    {
      id: 'act:tidy-tabs',
      kind: 'action',
      title: `Tidy Tabs (${state.ungroupedCount})`,
      subtitle: 'Auto-group ungrouped tabs with AI',
      keywords: 'tidy ai group organize 整理 自動 タブグループ',
      badge: 'Action',
      actionId: 'tidy-tabs',
    },
    {
      id: 'act:archive-now',
      kind: 'action',
      title: 'Archive Idle Tabs Now',
      subtitle: 'Archive idle ungrouped tabs immediately',
      keywords: 'archive clean close アーカイブ 整理',
      badge: 'Action',
      actionId: 'archive-now',
    },
    ...state.tabGroups.map((g) => ({
      id: `act:unload-group:${g.groupId}`,
      kind: 'action' as const,
      title: `Sleep Group: ${g.title}`,
      subtitle: `Reset & unload ${g.tabs.length} tabs in "${g.title}" and collapse`,
      keywords: `unload sleep group fold 休眠 一括 グループ ${g.title}`,
      groupTitle: g.title,
      groupColor: g.color,
      badge: 'Sleep',
      actionId: `unload-group:${g.groupId}` as PaletteActionId,
    })),
    ...state.tabGroups.map((g) => ({
      id: `act:toggle-collapse:${g.groupId}`,
      kind: 'action' as const,
      title: `${g.collapsed ? 'Expand' : 'Collapse'} Group: ${g.title}`,
      subtitle: `${g.collapsed ? 'Expand' : 'Collapse'} tab group "${g.title}"`,
      keywords: `collapse expand fold toggle group 折りたたみ 展開 開閉 ${g.title}`,
      groupTitle: g.title,
      groupColor: g.color,
      badge: 'Group',
      actionId: `toggle-collapse:${g.groupId}` as PaletteActionId,
    })),
    ...(state.otherWindowGroups ?? []).map((g) => ({
      id: `act:pull-group:${g.groupId}`,
      kind: 'action' as const,
      title: `Pull Group Here: ${g.title}`,
      subtitle: `Move tab group (${g.tabCount} tabs) from another window to this window`,
      keywords: `pull bring move group window here 持ってくる 別ウィンドウ グループ ${g.title}`,
      groupTitle: g.title,
      groupColor: g.color,
      badge: 'Pull',
      actionId: `pull-group:${g.groupId}` as PaletteActionId,
    })),
    ...state.openTabs
      .filter(
        (t) => state.currentWindowId != null && t.windowId !== state.currentWindowId,
      )
      .map((t) => ({
        id: `act:pull-tab:${t.tabId}`,
        kind: 'action' as const,
        title: `Pull Tab Here: ${t.title}`,
        subtitle: `Move from another window · ${t.url}`,
        keywords: `pull bring move tab window here 持ってくる 別ウィンドウ ${t.title} ${t.url}`,
        favIconUrl: t.favIconUrl,
        groupTitle: t.groupTitle,
        groupColor: t.groupColor,
        badge: 'Pull',
        actionId: `pull-tab:${t.tabId}` as PaletteActionId,
      })),
    {
      id: 'act:open-options',
      kind: 'action',
      title: 'Open Arkee Settings',
      subtitle: 'Configure Auto-Archive, ATC rules, and AI backend',
      keywords: 'settings options config preferences 設定',
      badge: 'Action',
      actionId: 'open-options',
    },
  ];

  const tabs: PaletteItem[] = state.openTabs.map((t) => {
    const isOtherWindow =
      state.currentWindowId != null && t.windowId !== state.currentWindowId;
    return {
      id: `tab:${t.tabId}`,
      kind: 'tab',
      title: t.title,
      subtitle: t.url,
      favIconUrl: t.favIconUrl,
      groupTitle: t.groupTitle,
      groupColor: t.groupColor,
      isOtherWindow,
      badge: isOtherWindow
        ? 'Other Win'
        : t.active
          ? 'Active'
          : t.discarded
            ? '休眠'
            : undefined,
      tabId: t.tabId,
      windowId: t.windowId,
    };
  });

  const archives: PaletteItem[] = state.archivedTabs.map((a) => ({
    id: `arc:${a.id}`,
    kind: 'archive',
    title: a.title,
    subtitle: a.url,
    favIconUrl: a.favIconUrl,
    badge: 'Archive',
    archiveId: a.id,
  }));

  const pool: PaletteItem[] =
    scope === 'action'
      ? actions
      : scope === 'tab'
        ? tabs
        : scope === 'archive'
          ? archives
          : [...actions, ...tabs, ...archives];

  const terms = searchText.toLowerCase().split(/\s+/).filter(Boolean);

  let results: PaletteItem[];
  if (terms.length === 0) {
    results = pool.slice(0, 25);
  } else {
    results = pool
      .map((item) => ({
        item,
        score:
          inlineGroupName && item.id === `act:create-group:${inlineGroupName}`
            ? 200
            : scoreMatch(item, terms),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
      .slice(0, 25);
  }

  // Always offer direct URL open or web search at the bottom when typing in default scope
  if (scope === 'all' && searchText.length > 0) {
    const directUrl = normalizeUrlInput(searchText);
    if (directUrl) {
      results.push({
        id: `open:${directUrl}`,
        kind: 'open-url',
        title: `Open URL: ${directUrl}`,
        subtitle: 'Open in a new tab',
        badge: 'Open',
        targetUrl: directUrl,
      });
    } else {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchText)}`;
      results.push({
        id: `search:${searchText}`,
        kind: 'open-url',
        title: `Search Google: "${searchText}"`,
        subtitle: 'Open search results in a new tab',
        badge: 'Search',
        targetUrl: searchUrl,
      });
    }
  }

  return results;
}
