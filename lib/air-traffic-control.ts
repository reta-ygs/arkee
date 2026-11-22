import { getAtcRoutedSet, getSettings, markAtcRouted } from './storage';
import type { AtcRule } from './types';

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchAtcRule(url: string, rules: AtcRule[]): AtcRule | null {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return null;
  }

  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern.trim()) continue;
    try {
      const regex =
        rule.matchType === 'regex'
          ? new RegExp(rule.pattern, 'i')
          : globToRegExp(rule.pattern.trim());
      if (regex.test(url)) {
        return rule;
      }
    } catch {
      // Ignore invalid user regex
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
