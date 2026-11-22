import { useEffect, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Keyboard,
  Pin,
  Plus,
  Route,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { getSettings, saveSettings } from '../../lib/storage';
import { isBuiltInAiAvailable } from '../../lib/tidy-tabs';
import {
  DEFAULT_SETTINGS,
  TAB_GROUP_COLORS,
  type AiBackendMode,
  type AtcMatchType,
  type AtcRule,
  type ByokProvider,
  type Settings,
  type TabGroupColor,
} from '../../lib/types';

const PROVIDER_ORIGINS: Record<ByokProvider, string> = {
  openai: 'https://api.openai.com/*',
  gemini: 'https://generativelanguage.googleapis.com/*',
  claude: 'https://api.anthropic.com/*',
};

const COLOR_SWATCH: Record<TabGroupColor, string> = {
  grey: 'bg-slate-400',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-500',
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [extraParamsText, setExtraParamsText] = useState('');
  const [builtInAvailable, setBuiltInAvailable] = useState<boolean | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    void (async () => {
      const [loaded, aiOk] = await Promise.all([
        getSettings(),
        isBuiltInAiAvailable(),
      ]);
      setSettings(loaded);
      setExtraParamsText(loaded.quickCopy.extraStripParams.join(', '));
      setBuiltInAvailable(aiOk);
    })();
  }, []);

  const persist = async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
    setSavedBanner(true);
    window.setTimeout(() => setSavedBanner(false), 1800);
  };

  const handleAddRule = () => {
    const newRule: AtcRule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      pattern: '*://example.com/*',
      matchType: 'glob',
      groupTitle: 'Work',
      groupColor: 'blue',
      enabled: true,
    };
    void persist({
      ...settings,
      atc: { ...settings.atc, rules: [...settings.atc.rules, newRule] },
    });
  };

  const handleUpdateRule = (id: string, patch: Partial<AtcRule>) => {
    const rules = settings.atc.rules.map((r) =>
      r.id === id ? { ...r, ...patch } : r,
    );
    void persist({ ...settings, atc: { ...settings.atc, rules } });
  };

  const handleDeleteRule = (id: string) => {
    const rules = settings.atc.rules.filter((r) => r.id !== id);
    void persist({ ...settings, atc: { ...settings.atc, rules } });
  };

  const handleRequestProviderPermission = async () => {
    const origin = PROVIDER_ORIGINS[settings.tidyTabs.byokProvider];
    try {
      await chrome.permissions.request({ origins: [origin] });
    } catch {
      // Ignore if permission request is cancelled
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow">
            A
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Arkee 設定</h1>
            <p className="text-xs text-slate-400">
              Chrome 標準垂直タブ & タブグループ向けワークフローツールキット
            </p>
          </div>
        </div>
        {savedBanner && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/30">
            <Check className="h-3.5 w-3.5" /> 保存しました
          </span>
        )}
      </header>

      <div className="space-y-6">
        {/* 1. Auto-Archive */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">1. Auto-Archive（未操作タブの自動退避）</h2>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={settings.autoArchive.enabled}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    autoArchive: { ...settings.autoArchive, enabled: e.target.checked },
                  })
                }
                className="accent-indigo-500"
              />
              有効
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">アーカイブまでの未操作時間（時間）</span>
              <input
                type="number"
                min={1}
                max={720}
                value={settings.autoArchive.idleHours}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    autoArchive: {
                      ...settings.autoArchive,
                      idleHours: Math.max(1, Number(e.target.value) || 12),
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <div className="flex flex-col justify-center gap-2 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.autoArchive.excludeAudible}
                  onChange={(e) =>
                    void persist({
                      ...settings,
                      autoArchive: {
                        ...settings.autoArchive,
                        excludeAudible: e.target.checked,
                      },
                    })
                  }
                  className="accent-indigo-500"
                />
                音声再生中タブを除外
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.autoArchive.excludeGrouped}
                  onChange={(e) =>
                    void persist({
                      ...settings,
                      autoArchive: {
                        ...settings.autoArchive,
                        excludeGrouped: e.target.checked,
                      },
                    })
                  }
                  className="accent-indigo-500"
                />
                タブグループ内のタブを除外
              </label>
            </div>
          </div>
        </section>

        {/* 2. Tab Group Home URL */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold">
                2. Tab Group ホームURL記憶＆リセット・休眠
              </h2>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={settings.groupHome.enabled}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    groupHome: { ...settings.groupHome, enabled: e.target.checked },
                  })
                }
                className="accent-indigo-500"
              />
              有効
            </label>
          </div>
          <div className="space-y-2 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.groupHome.autoCaptureOnGroup}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    groupHome: {
                      ...settings.groupHome,
                      autoCaptureOnGroup: e.target.checked,
                    },
                  })
                }
                className="accent-indigo-500"
              />
              タブをタブグループへ入れた瞬間のURLを自動的にホームURLとして記録する
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.groupHome.discardOnReset}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    groupHome: {
                      ...settings.groupHome,
                      discardOnReset: e.target.checked,
                    },
                  })
                }
                className="accent-indigo-500"
              />
              リセット時にタブを休眠（メモリ解放）し、同期されるタブグループ内に残したまま擬似クローズする
            </label>
          </div>
        </section>

        {/* 3. Quick Copy & Clean URL */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Copy className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold">3. Quick Copy URL & Clean URL</h2>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={settings.quickCopy.cleanTrackingParams}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    quickCopy: {
                      ...settings.quickCopy,
                      cleanTrackingParams: e.target.checked,
                    },
                  })
                }
                className="accent-indigo-500"
              />
              コピー時にトラッキングパラメータ（utm_*, fbclid, gclid 等）を自動除去する
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={settings.quickCopy.showPageToast}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    quickCopy: {
                      ...settings.quickCopy,
                      showPageToast: e.target.checked,
                    },
                  })
                }
                className="accent-indigo-500"
              />
              コピー完了時にページ右上へトースト通知を表示する
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">
                追加で除去するクエリパラメータ（カンマ区切り）
              </span>
              <input
                type="text"
                value={extraParamsText}
                onChange={(e) => setExtraParamsText(e.target.value)}
                onBlur={() => {
                  const list = extraParamsText
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  void persist({
                    ...settings,
                    quickCopy: { ...settings.quickCopy, extraStripParams: list },
                  });
                }}
                placeholder="ref, source, share_id"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </div>
        </section>

        {/* 4. Air Traffic Control */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold">
                4. Air Traffic Control（URLルール → Tab Group 振り分け）
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.atc.enabled}
                  onChange={(e) =>
                    void persist({
                      ...settings,
                      atc: { ...settings.atc, enabled: e.target.checked },
                    })
                  }
                  className="accent-indigo-500"
                />
                有効
              </label>
              <button
                type="button"
                onClick={handleAddRule}
                className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" /> ルール追加
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {settings.atc.rules.map((rule) => (
              <div
                key={rule.id}
                className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    handleUpdateRule(rule.id, { enabled: e.target.checked })
                  }
                  className="col-span-1 accent-indigo-500"
                  title="ルール有効化"
                />
                <input
                  type="text"
                  value={rule.pattern}
                  onChange={(e) =>
                    handleUpdateRule(rule.id, { pattern: e.target.value })
                  }
                  placeholder="*://github.com/*"
                  className="col-span-4 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                />
                <select
                  value={rule.matchType}
                  onChange={(e) =>
                    handleUpdateRule(rule.id, {
                      matchType: e.target.value as AtcMatchType,
                    })
                  }
                  className="col-span-2 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-xs text-slate-200"
                >
                  <option value="glob">Glob</option>
                  <option value="regex">Regex</option>
                </select>
                <input
                  type="text"
                  value={rule.groupTitle}
                  onChange={(e) =>
                    handleUpdateRule(rule.id, { groupTitle: e.target.value })
                  }
                  placeholder="グループ名"
                  className="col-span-2 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                />
                <div className="col-span-2 flex items-center gap-1.5">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${COLOR_SWATCH[rule.groupColor]}`}
                  />
                  <select
                    value={rule.groupColor}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, {
                        groupColor: e.target.value as TabGroupColor,
                      })
                    }
                    className="w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-xs text-slate-200"
                  >
                    {TAB_GROUP_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  className="col-span-1 flex justify-center text-slate-500 hover:text-red-400"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Tidy Tabs (AI) */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">5. Tidy Tabs（AI 自動グルーピング）</h2>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                builtInAvailable
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              Chrome Built-in AI:{' '}
              {builtInAvailable === null
                ? '確認中...'
                : builtInAvailable
                  ? '利用可能'
                  : '未検出（BYOK / ドメイン分類へフォールバック）'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <label className="block">
              <span className="mb-1 block text-slate-400">推論エンジンモード</span>
              <select
                value={settings.tidyTabs.mode}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    tidyTabs: {
                      ...settings.tidyTabs,
                      mode: e.target.value as AiBackendMode,
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                <option value="auto">自動（Built-in AI → BYOK → ドメイン分類）</option>
                <option value="builtin">Chrome Built-in AI のみ</option>
                <option value="byok">BYOK API のみ</option>
                <option value="domain">ドメイン分類のみ（AI不使用）</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-400">BYOK プロバイダ</span>
              <select
                value={settings.tidyTabs.byokProvider}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    tidyTabs: {
                      ...settings.tidyTabs,
                      byokProvider: e.target.value as ByokProvider,
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Anthropic Claude</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-400">BYOK API キー（ローカル保存）</span>
              <input
                type="password"
                value={settings.tidyTabs.byokApiKey}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    tidyTabs: { ...settings.tidyTabs, byokApiKey: e.target.value },
                  })
                }
                placeholder="sk-... / AIza..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-400">モデル名（空欄でデフォルト）</span>
              <input
                type="text"
                value={settings.tidyTabs.byokModel}
                onChange={(e) =>
                  void persist({
                    ...settings,
                    tidyTabs: { ...settings.tidyTabs, byokModel: e.target.value },
                  })
                }
                placeholder="gemini-2.5-flash / gpt-4o-mini"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              BYOK API を使う場合は、対象 API ドメインへの通信権限を許可してください。
            </p>
            <button
              type="button"
              onClick={() => void handleRequestProviderPermission()}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
            >
              API 通信権限を許可
            </button>
          </div>
        </section>

        {/* Shortcuts Guide */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-slate-300" />
            <h2 className="text-sm font-semibold">キーボードショートカット</h2>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Chrome の拡張機能ショートカット設定画面（
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">
              chrome://extensions/shortcuts
            </code>
            ）から自由にキーを変更できます。
          </p>
          <ul className="grid gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
            <li>• Popup / アーカイブ検索: <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Cmd+Shift+A</kbd> / <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+Shift+A</kbd></li>
            <li>• Quick Copy Clean URL: <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Cmd+Shift+C</kbd> / <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+Shift+C</kbd></li>
            <li>• Tab Group 内タブ リセット＆休眠: <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Cmd+Shift+R</kbd> / <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+Shift+R</kbd></li>
            <li>• Tidy Tabs 実行: <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Cmd+Shift+T</kbd> / <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+Shift+T</kbd></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
