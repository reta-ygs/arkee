import { describe, expect, it } from 'vitest';
import { buildPaletteItems } from '../lib/command-palette';
import { DEFAULT_SETTINGS, type PopupState } from '../lib/types';

const sampleState: PopupState = {
  settings: DEFAULT_SETTINGS,
  ungroupedCount: 3,
  currentWindowId: 1,
  activeTabId: 10,
  otherWindowGroups: [
    {
      groupId: 99,
      windowId: 2,
      title: 'Docs',
      color: 'blue',
      tabCount: 2,
    },
  ],
  tabGroups: [
    {
      groupId: 1,
      title: 'Dev',
      color: 'purple',
      collapsed: false,
      tabs: [
        {
          tabId: 10,
          title: 'GitHub PRs',
          currentUrl: 'https://github.com/pulls',
          homeUrl: 'https://github.com/pulls',
          isDrifted: false,
          discarded: false,
        },
      ],
    },
  ],
  openTabs: [
    {
      tabId: 10,
      windowId: 1,
      title: 'GitHub PRs',
      url: 'https://github.com/pulls',
      active: true,
      discarded: false,
      groupTitle: 'Dev',
      groupColor: 'purple',
    },
    {
      tabId: 11,
      windowId: 2,
      title: 'Linear Issues',
      url: 'https://linear.app/team',
      active: false,
      discarded: false,
    },
  ],
  archivedTabs: [
    {
      id: 'arc-1',
      title: 'WXT Guide',
      url: 'https://wxt.dev/guide',
      archivedAt: 1000,
      lastActiveAt: 500,
    },
  ],
};

describe('buildPaletteItems', () => {
  it('filters actions only with > prefix', () => {
    const items = buildPaletteItems(sampleState, '> tidy');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.kind === 'action')).toBe(true);
    expect(items[0].actionId).toBe('tidy-tabs');
  });

  it('filters open tabs only with @ prefix', () => {
    const items = buildPaletteItems(sampleState, '@ linear');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('tab');
    expect(items[0].tabId).toBe(11);
  });

  it('filters archived tabs only with # prefix', () => {
    const items = buildPaletteItems(sampleState, '# wxt');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('archive');
    expect(items[0].archiveId).toBe('arc-1');
  });

  it('offers direct URL open or Google search fallback in default mode', () => {
    const urlItems = buildPaletteItems(sampleState, 'example.com/docs');
    expect(urlItems.at(-1)?.kind).toBe('open-url');
    expect(urlItems.at(-1)?.targetUrl).toBe('https://example.com/docs');

    const searchItems = buildPaletteItems(sampleState, 'chrome tab groups');
    expect(searchItems.at(-1)?.kind).toBe('open-url');
    expect(searchItems.at(-1)?.targetUrl).toContain('google.com/search?q=');
  });

  it('includes add-to-group, inline create-group, and ungroup actions', () => {
    const addItems = buildPaletteItems(sampleState, '> 追加 Dev');
    expect(addItems.some((i) => i.actionId === 'add-to-group:1')).toBe(true);

    const createItems = buildPaletteItems(sampleState, '> new Research');
    expect(createItems[0]?.actionId).toBe('create-group:Research');

    const ungroupItems = buildPaletteItems(
      { ...sampleState, activeTabGroupId: 1 },
      '> 外す',
    );
    expect(ungroupItems.some((i) => i.actionId === 'ungroup-active-tab')).toBe(true);
  });

  it('marks other-window tabs and provides Pull Tab / Pull Group actions', () => {
    const tabItems = buildPaletteItems(sampleState, '@ linear');
    expect(tabItems[0]?.isOtherWindow).toBe(true);
    expect(tabItems[0]?.badge).toBe('Other Win');

    const pullActions = buildPaletteItems(sampleState, '> pull');
    expect(pullActions.some((i) => i.actionId === 'pull-tab:11')).toBe(true);
    expect(pullActions.some((i) => i.actionId === 'pull-group:99')).toBe(true);
  });
});
