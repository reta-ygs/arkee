import { getSettings } from './storage';
import {
  type Settings,
  TAB_GROUP_COLORS,
  type TabGroupColor,
  type TidyGroupSuggestion,
  type TidyResult,
} from './types';

export interface TidyTabInput {
  id: number;
  title: string;
  url: string;
}

interface BuiltInLanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy?: () => void;
}

interface BuiltInLanguageModelOptions {
  expectedInputs?: Array<{ type: 'text'; languages: string[] }>;
  expectedOutputs?: Array<{ type: 'text'; languages: string[] }>;
  initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
}

interface BuiltInLanguageModelStatic {
  availability?: (options?: BuiltInLanguageModelOptions) => Promise<string>;
  create: (options?: BuiltInLanguageModelOptions) => Promise<BuiltInLanguageModelSession>;
}

const SUPPORTED_BUILTIN_OUTPUT_LANGUAGES = ['ja', 'en'] as const;

function makeBuiltInLanguageOptions(outputLanguage: string): BuiltInLanguageModelOptions {
  return {
    expectedInputs: [{ type: 'text', languages: ['en', 'ja'] }],
    expectedOutputs: [{ type: 'text', languages: [outputLanguage] }],
  };
}

const VALID_COLORS = new Set<string>(TAB_GROUP_COLORS);

const SYSTEM_PROMPT = `You organize browser tabs into concise Chrome Tab Groups.
Return ONLY valid JSON matching this schema:
{"groups":[{"title":"Short Group Name (1-2 words)","color":"blue|red|yellow|green|pink|purple|cyan|orange|grey","tabIds":[1,2]}]}
Rules:
- Only include groups with at least the requested minimum number of tabs.
- Each tabId may appear at most once and must come from the provided list.
- Keep titles short (max 18 chars) and descriptive.
- Do not include markdown fences or extra commentary.`;

function buildUserPrompt(
  tabs: TidyTabInput[],
  minTabsPerGroup: number,
  customHint: string,
): string {
  const lines = tabs.map((t) => {
    let host = '';
    try {
      host = new URL(t.url).hostname.replace(/^www\./, '');
    } catch {
      host = t.url;
    }
    return `- id=${t.id} | host=${host} | title=${t.title.slice(0, 90)}`;
  });

  return [
    `Minimum tabs per group: ${minTabsPerGroup}`,
    customHint.trim() ? `User preference: ${customHint.trim()}` : '',
    'Tabs:',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseTidyJson(
  rawText: string,
  validTabIds: Set<number>,
  minTabsPerGroup: number,
): TidyGroupSuggestion[] {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return [];
  }

  let parsed: { groups?: Array<{ title?: unknown; color?: unknown; tabIds?: unknown }> };
  try {
    parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.groups)) return [];

  const assigned = new Set<number>();
  const suggestions: TidyGroupSuggestion[] = [];

  for (const g of parsed.groups) {
    const title = typeof g.title === 'string' ? g.title.trim().slice(0, 24) : '';
    if (!title || !Array.isArray(g.tabIds)) continue;

    const color: TabGroupColor =
      typeof g.color === 'string' && VALID_COLORS.has(g.color)
        ? (g.color as TabGroupColor)
        : TAB_GROUP_COLORS[suggestions.length % TAB_GROUP_COLORS.length];

    const ids: number[] = [];
    for (const rawId of g.tabIds) {
      const id = Number(rawId);
      if (Number.isInteger(id) && validTabIds.has(id) && !assigned.has(id)) {
        assigned.add(id);
        ids.push(id);
      }
    }

    if (ids.length >= minTabsPerGroup) {
      suggestions.push({ title, color, tabIds: ids });
    }
  }

  return suggestions;
}

export function buildDomainFallbackGroups(
  tabs: TidyTabInput[],
  minTabsPerGroup: number,
): TidyGroupSuggestion[] {
  const buckets = new Map<string, number[]>();

  for (const tab of tabs) {
    let label = 'Other';
    try {
      const host = new URL(tab.url).hostname.replace(/^www\./, '');
      const parts = host.split('.');
      const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      label = core.charAt(0).toUpperCase() + core.slice(1);
    } catch {
      continue;
    }

    const list = buckets.get(label) ?? [];
    list.push(tab.id);
    buckets.set(label, list);
  }

  const results: TidyGroupSuggestion[] = [];
  let colorIndex = 1; // start at blue
  for (const [title, tabIds] of buckets.entries()) {
    if (tabIds.length >= minTabsPerGroup) {
      results.push({
        title,
        color: TAB_GROUP_COLORS[colorIndex % TAB_GROUP_COLORS.length],
        tabIds,
      });
      colorIndex++;
    }
  }

  return results;
}

function getBuiltInLanguageModel(): BuiltInLanguageModelStatic | null {
  const g = globalThis as unknown as {
    LanguageModel?: BuiltInLanguageModelStatic;
    ai?: { languageModel?: BuiltInLanguageModelStatic };
  };
  return g.LanguageModel ?? g.ai?.languageModel ?? null;
}

async function resolveBuiltInAiLanguage(
  lm: BuiltInLanguageModelStatic,
): Promise<string | null> {
  if (typeof lm.availability !== 'function') {
    return SUPPORTED_BUILTIN_OUTPUT_LANGUAGES[0];
  }

  for (const lang of SUPPORTED_BUILTIN_OUTPUT_LANGUAGES) {
    try {
      const state = await lm.availability(makeBuiltInLanguageOptions(lang));
      if (state === 'available' || state === 'readily' || state === 'downloadable') {
        return lang;
      }
    } catch {
      // Try next supported language
    }
  }

  return null;
}

export async function isBuiltInAiAvailable(): Promise<boolean> {
  const lm = getBuiltInLanguageModel();
  if (!lm) return false;
  return (await resolveBuiltInAiLanguage(lm)) !== null;
}

async function runBuiltInAi(
  tabs: TidyTabInput[],
  settings: Settings['tidyTabs'],
): Promise<TidyGroupSuggestion[] | null> {
  const lm = getBuiltInLanguageModel();
  if (!lm) return null;

  const lang = await resolveBuiltInAiLanguage(lm);
  if (!lang) return null;

  const langOptions = makeBuiltInLanguageOptions(lang);
  let session: BuiltInLanguageModelSession;
  try {
    session = await lm.create({
      ...langOptions,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
    });
  } catch {
    session = await lm.create({
      ...langOptions,
      systemPrompt: SYSTEM_PROMPT,
    });
  }

  try {
    const prompt = buildUserPrompt(tabs, settings.minTabsPerGroup, settings.customHint);
    const raw = await session.prompt(prompt);
    const validIds = new Set(tabs.map((t) => t.id));
    return parseTidyJson(raw, validIds, settings.minTabsPerGroup);
  } finally {
    session.destroy?.();
  }
}

async function runByokAi(
  tabs: TidyTabInput[],
  settings: Settings['tidyTabs'],
): Promise<TidyGroupSuggestion[]> {
  const apiKey = settings.byokApiKey.trim();
  if (!apiKey) {
    throw new Error('BYOK API key is not configured');
  }

  const userPrompt = buildUserPrompt(tabs, settings.minTabsPerGroup, settings.customHint);
  let rawText = '';

  if (settings.byokProvider === 'openai') {
    const model = settings.byokModel.trim() || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawText = data.choices?.[0]?.message?.content ?? '';
  } else if (settings.byokProvider === 'gemini') {
    const model = settings.byokModel.trim() || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } else {
    const model = settings.byokModel.trim() || 'claude-3-5-haiku-latest';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    rawText = data.content?.[0]?.text ?? '';
  }

  const validIds = new Set(tabs.map((t) => t.id));
  return parseTidyJson(rawText, validIds, settings.minTabsPerGroup);
}

function isValidWindowId(windowId: number | undefined): windowId is number {
  const noneId = chrome.windows?.WINDOW_ID_NONE ?? -1;
  return windowId != null && windowId !== noneId;
}

async function resolveTargetWindowId(windowId?: number): Promise<number | null> {
  if (isValidWindowId(windowId)) {
    return windowId;
  }

  try {
    const lastFocused = await chrome.windows.getLastFocused({
      windowTypes: ['normal'],
    });
    if (isValidWindowId(lastFocused?.id)) {
      return lastFocused.id;
    }
  } catch {
    // Fallback to active tab lookup
  }

  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (isValidWindowId(activeTab?.windowId)) {
      return activeTab.windowId;
    }
  } catch {
    // No active window available
  }

  return null;
}

export async function runTidyTabs(windowId?: number): Promise<TidyResult> {
  const settings = await getSettings();
  const targetWindowId = await resolveTargetWindowId(windowId);

  if (targetWindowId == null) {
    return {
      engine: 'domain',
      groupsCreated: 0,
      tabsGrouped: 0,
      note: 'No active browser window found',
    };
  }

  const noneGroupId = chrome.tabGroups.TAB_GROUP_ID_NONE;
  const allTabs = await chrome.tabs.query({
    windowId: targetWindowId,
    pinned: false,
    groupId: noneGroupId,
  });

  const candidates: TidyTabInput[] = allTabs
    .filter(
      (t): t is chrome.tabs.Tab & { id: number; url: string } =>
        t.id != null &&
        t.windowId === targetWindowId &&
        !t.pinned &&
        t.groupId === noneGroupId &&
        Boolean(t.url) &&
        (t.url!.startsWith('http://') || t.url!.startsWith('https://')),
    )
    .map((t) => ({
      id: t.id,
      title: t.title || t.url,
      url: t.url,
    }));

  if (candidates.length < settings.tidyTabs.minTabsPerGroup) {
    return {
      engine: 'domain',
      groupsCreated: 0,
      tabsGrouped: 0,
      note: 'Not enough ungrouped tabs to organize',
    };
  }

  let suggestions: TidyGroupSuggestion[] = [];
  let engine: TidyResult['engine'] = 'domain';
  let note: string | undefined;

  const mode = settings.tidyTabs.mode;

  if (mode === 'auto' || mode === 'builtin') {
    try {
      const builtIn = await runBuiltInAi(candidates, settings.tidyTabs);
      if (builtIn && builtIn.length > 0) {
        suggestions = builtIn;
        engine = 'builtin';
      }
    } catch (err) {
      note = `Built-in AI unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (
    suggestions.length === 0 &&
    (mode === 'byok' || (mode === 'auto' && settings.tidyTabs.byokApiKey.trim()))
  ) {
    try {
      suggestions = await runByokAi(candidates, settings.tidyTabs);
      engine = 'byok';
      note = undefined;
    } catch (err) {
      note = `BYOK error (${err instanceof Error ? err.message : String(err)}), used domain fallback`;
    }
  }

  if (suggestions.length === 0 && mode !== 'builtin') {
    suggestions = buildDomainFallbackGroups(
      candidates,
      settings.tidyTabs.minTabsPerGroup,
    );
    engine = 'domain';
    if (!note && mode !== 'domain') {
      note = 'Built-in AI / BYOK not configured — grouped by domain';
    }
  }

  const currentWindowTabs = await chrome.tabs.query({
    windowId: targetWindowId,
  });
  const eligibleTabIds = new Set(
    currentWindowTabs
      .filter(
        (t): t is chrome.tabs.Tab & { id: number } =>
          t.id != null &&
          t.windowId === targetWindowId &&
          !t.pinned &&
          t.groupId === noneGroupId,
      )
      .map((t) => t.id),
  );

  let groupsCreated = 0;
  let tabsGrouped = 0;

  for (const group of suggestions) {
    const tabIds = group.tabIds.filter((id) => eligibleTabIds.has(id));
    if (tabIds.length < settings.tidyTabs.minTabsPerGroup) continue;
    for (const id of tabIds) {
      eligibleTabIds.delete(id);
    }
    try {
      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        createProperties: { windowId: targetWindowId },
      });
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color,
      });
      groupsCreated++;
      tabsGrouped += tabIds.length;
    } catch {
      // Tab may have closed or moved during AI inference
    }
  }

  return { engine, groupsCreated, tabsGrouped, note };
}
