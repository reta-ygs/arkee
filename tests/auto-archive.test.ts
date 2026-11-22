import { describe, expect, it } from 'vitest';
import { isArchivableTab, searchArchivedTabs } from '../lib/auto-archive';
import type { ArchivedTab, Settings } from '../lib/types';

const cfg: Settings['autoArchive'] = {
  enabled: true,
  idleHours: 12,
  excludeAudible: true,
  excludeGrouped: true,
};

describe('isArchivableTab', () => {
  const now = 1_700_000_000_000;
  const thirteenHoursAgo = now - 13 * 60 * 60 * 1000;
  const oneHourAgo = now - 1 * 60 * 60 * 1000;

  it('archives idle unpinned non-active http tabs', () => {
    expect(
      isArchivableTab(
        { id: 1, url: 'https://example.com', active: false, pinned: false, groupId: -1 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(true);
  });

  it('protects active, pinned, audible, grouped, and chrome:// tabs', () => {
    expect(
      isArchivableTab(
        { id: 1, url: 'https://example.com', active: true, pinned: false, groupId: -1 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(false);
    expect(
      isArchivableTab(
        { id: 2, url: 'https://example.com', active: false, pinned: true, groupId: -1 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(false);
    expect(
      isArchivableTab(
        { id: 3, url: 'https://example.com', active: false, pinned: false, audible: true, groupId: -1 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(false);
    expect(
      isArchivableTab(
        { id: 4, url: 'https://example.com', active: false, pinned: false, groupId: 10 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(false);
    expect(
      isArchivableTab(
        { id: 5, url: 'chrome://settings', active: false, pinned: false, groupId: -1 },
        cfg,
        thirteenHoursAgo,
        now,
      ),
    ).toBe(false);
    expect(
      isArchivableTab(
        { id: 6, url: 'https://example.com', active: false, pinned: false, groupId: -1 },
        cfg,
        oneHourAgo,
        now,
      ),
    ).toBe(false);
  });
});

describe('searchArchivedTabs', () => {
  const items: ArchivedTab[] = [
    {
      id: '1',
      title: 'WXT Documentation',
      url: 'https://wxt.dev/guide',
      archivedAt: 100,
      lastActiveAt: 50,
    },
    {
      id: '2',
      title: 'React Hooks Reference',
      url: 'https://react.dev/reference',
      archivedAt: 200,
      lastActiveAt: 150,
    },
  ];

  it('matches multi-term queries across title and url', () => {
    expect(searchArchivedTabs(items, 'wxt guide')).toHaveLength(1);
    expect(searchArchivedTabs(items, 'react reference')[0]?.id).toBe('2');
    expect(searchArchivedTabs(items, '')).toHaveLength(2);
  });
});
