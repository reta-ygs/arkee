import { describe, expect, it } from 'vitest';
import {
  getUnsafeAtcRegexReason,
  MAX_ATC_URL_LENGTH,
  matchAtcRule,
  matchGlob,
} from '../lib/air-traffic-control';
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

function rule(pattern: string, matchType: AtcRule['matchType']): AtcRule {
  return {
    id: 'x',
    name: 'x',
    pattern,
    matchType,
    groupTitle: 'X',
    groupColor: 'grey',
    enabled: true,
  };
}

describe('matchGlob', () => {
  it('handles * and ? wildcards case-insensitively', () => {
    expect(matchGlob('*://GitHub.com/*', 'https://github.com/a')).toBe(true);
    expect(matchGlob('https://a?c.com/', 'https://abc.com/')).toBe(true);
    expect(matchGlob('https://a?c.com/', 'https://ac.com/')).toBe(false);
    expect(matchGlob('*docs*api*', 'https://x.com/docs/v1/api/y')).toBe(true);
    expect(matchGlob('*docs*api*', 'https://x.com/docs/v1/')).toBe(false);
  });

  it('treats regex metacharacters literally', () => {
    expect(matchGlob('https://a.com/(x)+', 'https://a.com/(x)+')).toBe(true);
    expect(matchGlob('https://a.com/', 'https://abcom/')).toBe(false);
  });
});

describe('matchAtcRule ReDoS resistance', () => {
  it('returns quickly for many-wildcard globs on a 100,000-char URL', () => {
    const url = `https://${'a'.repeat(100_000)}`;
    const start = performance.now();
    expect(matchAtcRule(url, [rule('*a*b*c*', 'glob')])).toBeNull();
    expect(matchGlob('*a*b*c*', url)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('returns quickly for many-wildcard globs at the length limit', () => {
    const url = `https://${'a'.repeat(MAX_ATC_URL_LENGTH - 8)}`;
    const start = performance.now();
    expect(matchAtcRule(url, [rule('*a*a*a*a*z', 'glob')])).toBeNull();
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('skips URLs longer than the limit', () => {
    const url = `https://example.com/${'a'.repeat(MAX_ATC_URL_LENGTH)}`;
    expect(matchAtcRule(url, [rule('*://example.com/*', 'glob')])).toBeNull();
  });

  it('never runs unsafe regex rules', () => {
    const url = `https://${'a'.repeat(MAX_ATC_URL_LENGTH - 8)}`;
    const start = performance.now();
    expect(
      matchAtcRule(url, [rule('(a+)+z', 'regex'), rule('.*a.*z', 'regex')]),
    ).toBeNull();
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('getUnsafeAtcRegexReason', () => {
  it.each([
    '^https://[a-z]+\\.atlassian\\.net/browse/',
    '^https://github\\.com/.*/pull/.*',
    'github\\.com/.*/pull',
    '^https://(www\\.)?example\\.com/',
    '^https://\\d{1,3}\\.\\d{1,3}/',
    '^https://(?:docs|api)\\.example\\.com/',
    '[(+*]+x',
  ])('accepts %s', (pattern) => {
    expect(getUnsafeAtcRegexReason(pattern)).toBeNull();
  });

  it.each([
    '(a+)+z',
    '^(\\w*)*$',
    '^(a|aa)+$',
    '^(?:a{1,5})+$',
    '(a)\\1',
    '(?<x>a)\\k<x>',
    '.*a.*z',
    '^https://.*a.*a.*z',
    '^https://a{1,100}b{1,100}c{1,100}',
  ])('rejects %s', (pattern) => {
    expect(getUnsafeAtcRegexReason(pattern)).not.toBeNull();
  });
});
