import { describe, expect, it } from 'vitest';
import { matchAtcRule } from '../lib/air-traffic-control';
import type { AtcRule } from '../lib/types';

const rules: AtcRule[] = [
  {
    id: 'r1',
    name: 'GitHub',
    pattern: '*://github.com/my-org/*',
    matchType: 'glob',
    groupTitle: 'Work',
    groupColor: 'purple',
    enabled: true,
  },
  {
    id: 'r2',
    name: 'Disabled',
    pattern: '*://youtube.com/*',
    matchType: 'glob',
    groupTitle: 'Media',
    groupColor: 'red',
    enabled: false,
  },
  {
    id: 'r3',
    name: 'Regex Jira',
    pattern: '^https://[a-z]+\\.atlassian\\.net/browse/',
    matchType: 'regex',
    groupTitle: 'Tickets',
    groupColor: 'blue',
    enabled: true,
  },
];

describe('matchAtcRule', () => {
  it('matches glob rules', () => {
    const hit = matchAtcRule('https://github.com/my-org/arkee/pulls', rules);
    expect(hit?.id).toBe('r1');
  });

  it('skips disabled rules', () => {
    expect(matchAtcRule('https://youtube.com/watch?v=123', rules)).toBeNull();
  });

  it('matches regex rules', () => {
    const hit = matchAtcRule('https://team.atlassian.net/browse/ARK-12', rules);
    expect(hit?.id).toBe('r3');
  });

  it('ignores chrome:// URLs', () => {
    expect(matchAtcRule('chrome://settings', rules)).toBeNull();
  });
});
