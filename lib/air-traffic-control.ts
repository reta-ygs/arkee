import { getAtcRoutedSet, getSettings, markAtcRouted } from './storage';
import type { AtcRule } from './types';

export const MAX_ATC_URL_LENGTH = 2048;

// Each unbounded quantifier (and an unanchored start) multiplies the backtracking
// work by the URL length, so the worst case grows like length^degree.
const MAX_ATC_REGEX_DEGREE = 2;
const LARGE_BOUNDED_REPEAT = 16;

// Walks the URL once, backtracking only to the most recent `*`, so the work is
// bounded by pattern length × URL length regardless of how many wildcards exist.
export function matchGlob(pattern: string, input: string): boolean {
  const p = pattern.toLowerCase();
  const s = input.toLowerCase();
  let pi = 0;
  let si = 0;
  let starPi = -1;
  let starSi = 0;

  while (si < s.length) {
    if (pi < p.length && (p[pi] === '?' || (p[pi] !== '*' && p[pi] === s[si]))) {
      pi++;
      si++;
    } else if (pi < p.length && p[pi] === '*') {
      starPi = pi++;
      starSi = si;
    } else if (starPi !== -1) {
      pi = starPi + 1;
      si = ++starSi;
    } else {
      return false;
    }
  }

  while (pi < p.length && p[pi] === '*') pi++;
  return pi === p.length;
}

interface GroupState {
  hasVariableRepeat: boolean;
  hasAlternation: boolean;
}

function readQuantifier(
  pattern: string,
  index: number,
): { length: number; unbounded: boolean; variable: boolean } | null {
  const ch = pattern[index];
  let length = 0;
  let unbounded = false;
  let variable = false;

  if (ch === '*' || ch === '+') {
    length = 1;
    unbounded = true;
    variable = true;
  } else if (ch === '?') {
    length = 1;
    variable = true;
  } else if (ch === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(index));
    if (!m) return null;
    length = m[0].length;
    const min = Number(m[1]);
    if (m[2] !== undefined) {
      const max = m[3] === '' ? Number.POSITIVE_INFINITY : Number(m[3]);
      variable = max > min;
      unbounded = max - min > LARGE_BOUNDED_REPEAT;
    }
  } else {
    return null;
  }

  if (pattern[index + length] === '?') length++;
  return { length, unbounded, variable };
}

/**
 * Returns a reason why a custom regex rule could backtrack catastrophically on a
 * website-controlled URL, or null if the pattern is considered safe to run.
 */
export function getUnsafeAtcRegexReason(pattern: string): string | null {
  const stack: GroupState[] = [{ hasVariableRepeat: false, hasAlternation: false }];
  let lastAtom: GroupState | null = null;
  let degree = pattern.startsWith('^') ? 0 : 1;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    const current = stack[stack.length - 1];

    if (ch === '\\') {
      const next = pattern[i + 1] ?? '';
      if (/[1-9]/.test(next) || (next === 'k' && pattern[i + 2] === '<')) {
        return '後方参照（\\1 など）は使用できません。';
      }
      lastAtom = null;
      i += 2;
      continue;
    }

    if (ch === '[') {
      let j = i + 1;
      if (pattern[j] === '^') j++;
      if (pattern[j] === ']') j++;
      while (j < pattern.length && pattern[j] !== ']') {
        j += pattern[j] === '\\' ? 2 : 1;
      }
      lastAtom = null;
      i = j + 1;
      continue;
    }

    if (ch === '(') {
      stack.push({ hasVariableRepeat: false, hasAlternation: false });
      lastAtom = null;
      i++;
      if (pattern[i] === '?') {
        const m = /^\?(?:[:=!]|<[=!]|<[^>]*>)/.exec(pattern.slice(i));
        i += m ? m[0].length : 1;
      }
      continue;
    }

    if (ch === ')') {
      if (stack.length === 1) return null;
      const closed = stack.pop() as GroupState;
      const parent = stack[stack.length - 1];
      parent.hasVariableRepeat ||= closed.hasVariableRepeat;
      lastAtom = closed;
      i++;
      continue;
    }

    if (ch === '|') {
      current.hasAlternation = true;
      lastAtom = null;
      i++;
      continue;
    }

    const quantifier = readQuantifier(pattern, i);
    if (quantifier) {
      if (
        quantifier.unbounded &&
        lastAtom &&
        (lastAtom.hasVariableRepeat || lastAtom.hasAlternation)
      ) {
        return '繰り返し内に繰り返しや | を含むグループ（例: "(a+)+"）は使用できません。';
      }
      if (quantifier.variable) current.hasVariableRepeat = true;
      if (quantifier.unbounded) degree++;
      lastAtom = null;
      i += quantifier.length;
      continue;
    }

    lastAtom = null;
    i++;
  }

  if (degree > MAX_ATC_REGEX_DEGREE) {
    return '"*" / "+" / "{n,}" が多すぎます。先頭が "^" なら 2 個まで、それ以外は 1 個までにしてください。';
  }
  return null;
}

export function matchAtcRule(url: string, rules: AtcRule[]): AtcRule | null {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return null;
  }
  if (url.length > MAX_ATC_URL_LENGTH) {
    return null;
  }

  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern.trim()) continue;
    if (rule.matchType === 'regex') {
      if (getUnsafeAtcRegexReason(rule.pattern)) continue;
      try {
        if (new RegExp(rule.pattern, 'i').test(url)) {
          return rule;
        }
      } catch {
        // Ignore invalid user regex
      }
    } else if (matchGlob(rule.pattern.trim(), url)) {
      return rule;
    }
  }

  return null;
}

export async function routeTabIfMatched(tab: chrome.tabs.Tab): Promise<boolean> {
  if (tab.id == null || tab.windowId == null || !tab.url || tab.pinned) {
    return false;
  }

  const settings = await getSettings();
  if (!settings.atc.enabled || settings.atc.rules.length === 0) {
    return false;
  }

  const rule = matchAtcRule(tab.url, settings.atc.rules);
  if (!rule) return false;

  const routed = await getAtcRoutedSet();
  if (routed[String(tab.id)] === rule.id) {
    return false;
  }

  // Find existing tab group in the same window with matching title
  const existingGroups = await chrome.tabGroups.query({
    windowId: tab.windowId,
    title: rule.groupTitle,
  });

  if (existingGroups.length > 0) {
    const targetGroup = existingGroups[0];
    if (tab.groupId !== targetGroup.id) {
      await chrome.tabs.group({
        tabIds: [tab.id],
        groupId: targetGroup.id,
      });
    }
  } else {
    const newGroupId = await chrome.tabs.group({
      tabIds: [tab.id],
      createProperties: { windowId: tab.windowId },
    });
    await chrome.tabGroups.update(newGroupId, {
      title: rule.groupTitle,
      color: rule.groupColor,
    });
  }

  await markAtcRouted(tab.id, rule.id);
  return true;
}
