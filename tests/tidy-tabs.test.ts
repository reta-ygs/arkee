import { describe, expect, it } from 'vitest';
import { buildDomainFallbackGroups, parseTidyJson } from '../lib/tidy-tabs';

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
