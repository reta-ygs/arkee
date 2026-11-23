import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDomainFallbackGroups, parseTidyJson, runTidyTabs } from '../lib/tidy-tabs';

describe('parseTidyJson', () => {
  it('parses fenced JSON, deduplicates tabIds, and filters small groups', () => {
    const raw = `\`\`\`json
    {
      "groups": [
        { "title": "GitHub Dev", "color": "purple", "tabIds": [1, 2, 999] },
        { "title": "Single", "color": "blue", "tabIds": [3] },
        { "title": "Overlap", "color": "invalid", "tabIds": [2, 4, 5] }
      ]
    }
    \`\`\``;
    const valid = new Set([1, 2, 3, 4, 5]);
    const parsed = parseTidyJson(raw, valid, 2);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      title: 'GitHub Dev',
      color: 'purple',
      tabIds: [1, 2],
    });
    expect(parsed[1].title).toBe('Overlap');
    expect(parsed[1].tabIds).toEqual([4, 5]);
  });
});

describe('buildDomainFallbackGroups', () => {
  it('groups tabs by second-level domain respecting minTabsPerGroup', () => {
    const groups = buildDomainFallbackGroups(
      [
        { id: 1, title: 'PR 1', url: 'https://github.com/a/b' },
        { id: 2, title: 'PR 2', url: 'https://github.com/c/d' },
        { id: 3, title: 'Single', url: 'https://example.org/' },
      ],
      2,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Github');
    expect(groups[0].tabIds).toEqual([1, 2]);
  });
});

interface MockTab {
  id: number;
  windowId: number;
  pinned: boolean;
  groupId: number;
  title: string;
  url: string;
  active?: boolean;
}

function setupChromeMock(options: {
  tabs: MockTab[];
  lastFocusedWindowId?: number;
  onQuery?: (queryInfo: chrome.tabs.QueryInfo) => MockTab[];
}) {
  const groupMock = vi.fn().mockResolvedValue(500);
  const updateGroupMock = vi.fn().mockResolvedValue({});
  const getLastFocusedMock = vi.fn().mockResolvedValue({
    id: options.lastFocusedWindowId,
  });
  const queryMock = vi
    .fn()
    .mockImplementation(async (queryInfo: chrome.tabs.QueryInfo) => {
      if (options.onQuery) {
        return options.onQuery(queryInfo);
      }
      return options.tabs.filter((t) => {
        if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) {
          return false;
        }
        if (queryInfo.pinned !== undefined && t.pinned !== queryInfo.pinned) {
          return false;
        }
        if (queryInfo.groupId !== undefined && t.groupId !== queryInfo.groupId) {
          return false;
        }
        if (queryInfo.active !== undefined && Boolean(t.active) !== queryInfo.active) {
          return false;
        }
        return true;
      });
    });

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          arkee_settings: {
            tidyTabs: {
              mode: 'domain',
              minTabsPerGroup: 2,
            },
          },
        }),
      },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: getLastFocusedMock,
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      update: updateGroupMock,
    },
    tabs: {
      query: queryMock,
      group: groupMock,
    },
  });

  return { groupMock, updateGroupMock, getLastFocusedMock, queryMock };
}

describe('runTidyTabs multi-window safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('only groups tabs in the target window and never touches tabs in other windows', async () => {
    const tabs: MockTab[] = [
      {
        id: 1,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 1',
        url: 'https://github.com/a',
      },
      {
        id: 2,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 2',
        url: 'https://github.com/b',
      },
      {
        id: 3,
        windowId: 20,
        pinned: false,
        groupId: -1,
        title: 'GH 3',
        url: 'https://github.com/c',
      },
      {
        id: 4,
        windowId: 20,
        pinned: false,
        groupId: -1,
        title: 'GH 4',
        url: 'https://github.com/d',
      },
    ];
    // Even if chrome.tabs.query unexpectedly returns tabs from another window, runTidyTabs filters by targetWindowId
    const { groupMock } = setupChromeMock({
      tabs,
      onQuery: () => tabs,
    });

    const result = await runTidyTabs(10);

    expect(result.groupsCreated).toBe(1);
    expect(result.tabsGrouped).toBe(2);
    expect(groupMock).toHaveBeenCalledTimes(1);
    expect(groupMock).toHaveBeenCalledWith({
      tabIds: [1, 2],
      createProperties: { windowId: 10 },
    });
  });

  it('does not query all windows or group tabs when no valid windowId can be resolved', async () => {
    const tabs: MockTab[] = [
      {
        id: 1,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 1',
        url: 'https://github.com/a',
      },
      {
        id: 2,
        windowId: 20,
        pinned: false,
        groupId: -1,
        title: 'GH 2',
        url: 'https://github.com/b',
      },
    ];
    const { groupMock, getLastFocusedMock } = setupChromeMock({
      tabs,
      lastFocusedWindowId: undefined,
    });

    const result = await runTidyTabs();

    expect(getLastFocusedMock).toHaveBeenCalledWith({ windowTypes: ['normal'] });
    expect(result.groupsCreated).toBe(0);
    expect(result.tabsGrouped).toBe(0);
    expect(groupMock).not.toHaveBeenCalled();
  });

  it('skips tabs that moved to another window before grouping is applied', async () => {
    let callCount = 0;
    const initialTabs: MockTab[] = [
      {
        id: 1,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 1',
        url: 'https://github.com/a',
      },
      {
        id: 2,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 2',
        url: 'https://github.com/b',
      },
      {
        id: 3,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 3',
        url: 'https://github.com/c',
      },
    ];
    // Before chrome.tabs.group runs, tab 3 moved to window 20
    const afterMoveTabs: MockTab[] = [
      {
        id: 1,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 1',
        url: 'https://github.com/a',
      },
      {
        id: 2,
        windowId: 10,
        pinned: false,
        groupId: -1,
        title: 'GH 2',
        url: 'https://github.com/b',
      },
      {
        id: 3,
        windowId: 20,
        pinned: false,
        groupId: -1,
        title: 'GH 3',
        url: 'https://github.com/c',
      },
    ];

    const { groupMock } = setupChromeMock({
      tabs: initialTabs,
      onQuery: () => {
        callCount++;
        return callCount === 1 ? initialTabs : afterMoveTabs;
      },
    });

    const result = await runTidyTabs(10);

    expect(result.groupsCreated).toBe(1);
    expect(result.tabsGrouped).toBe(2);
    expect(groupMock).toHaveBeenCalledWith({
      tabIds: [1, 2],
      createProperties: { windowId: 10 },
    });
  });
});
