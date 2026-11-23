import {
  Archive,
  ArrowDownLeft,
  BookmarkCheck,
  Command,
  Copy,
  CornerDownLeft,
  ExternalLink,
  FolderKanban,
  Globe,
  Moon,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { searchArchivedTabs } from '../../lib/auto-archive';
import { buildPaletteItems, type PaletteItem } from '../../lib/command-palette';
import type {
  CopyResult,
  GroupResetResult,
  GroupUnloadResult,
  PopupState,
  RuntimeMessage,
  TabGroupColor,
  TidyResult,
} from '../../lib/types';

type TabView = 'groups' | 'archive';

const GROUP_DOT: Record<TabGroupColor, string> = {
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

function sendMsg<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function getCurrentWindowId(): Promise<number | undefined> {
  try {
    const win = await chrome.windows.getCurrent();
    if (win.id != null && win.id !== chrome.windows.WINDOW_ID_NONE) {
      return win.id;
    }
  } catch {
    // Fallback to background window resolution
  }
  return undefined;
}

function formatRelativeTime(timestamp: number): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('groups');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [status, setStatus] = useState<{
    text: string;
    tone: 'ok' | 'err' | 'info';
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const paletteInputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    const windowId = await getCurrentWindowId();
    const data = await sendMsg<PopupState>({ type: 'GET_POPUP_STATE', windowId });
    setState(data);
  }, []);

  useEffect(() => {
    void loadState();
    paletteInputRef.current?.focus();
  }, [loadState]);

  const showStatus = (text: string, tone: 'ok' | 'err' | 'info' = 'ok') => {
    setStatus({ text, tone });
    window.setTimeout(() => {
      setStatus((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  const isPaletteMode = !creatingGroup && (paletteOpen || paletteQuery.trim().length > 0);

  const paletteItems = useMemo(() => {
    if (!state || !isPaletteMode) return [];
    return buildPaletteItems(state, paletteQuery);
  }, [state, isPaletteMode, paletteQuery]);

  useEffect(() => {
    if (selectedIndex >= 0) {
      selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const filteredArchive = useMemo(
    () => searchArchivedTabs(state?.archivedTabs ?? [], archiveQuery),
    [state?.archivedTabs, archiveQuery],
  );

  const totalGroupedTabs = useMemo(
    () => (state?.tabGroups ?? []).reduce((sum, g) => sum + g.tabs.length, 0),
    [state?.tabGroups],
  );

  const handleCopyUrl = async () => {
    setBusyAction('copy');
    try {
      const res = await sendMsg<CopyResult>({ type: 'QUICK_COPY_URL' });
      if (res.ok) {
        showStatus(res.cleaned ? 'Clean URL をコピーしました' : 'URL をコピーしました');
        return;
      }
      if (res.url) {
        try {
          await navigator.clipboard.writeText(res.url);
          showStatus(res.cleaned ? 'Clean URL をコピーしました' : 'URL をコピーしました');
          return;
        } catch {
          // Show original error below
        }
      }
      showStatus(res.error ?? 'コピーに失敗しました', 'err');
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetGroupTab = async (tabId?: number, discard?: boolean) => {
    setBusyAction('reset');
    try {
      const res = await sendMsg<GroupResetResult>({
        type: 'RESET_GROUP_TAB',
        tabId,
        discard,
      });
      if (res.ok) {
        if (res.error) {
          showStatus(res.error, 'info');
        } else {
          showStatus(
            res.discarded ? 'ホームURLへ戻して休眠しました' : 'ホームURLへ戻しました',
          );
        }
        await loadState();
      } else {
        showStatus(res.error ?? 'リセットできませんでした', 'info');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnloadGroup = async (groupId: number, title: string) => {
    setBusyAction(`unload-${groupId}`);
    try {
      const res = await sendMsg<GroupUnloadResult>({
        type: 'UNLOAD_TAB_GROUP',
        groupId,
      });
      if (res.ok) {
        showStatus(`「${title}」の${res.unloadedCount}タブを休眠しました`);
        await loadState();
      } else {
        showStatus(res.error ?? 'グループ休眠に失敗しました', 'err');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSetGroupHome = async (tabId: number) => {
    const res = await sendMsg<{ ok: boolean }>({ type: 'SET_GROUP_HOME', tabId });
    if (res.ok) {
      showStatus('現在のURLをホームURLに更新しました');
      await loadState();
    } else {
      showStatus('タブグループ内のタブではありません', 'info');
    }
  };

  const handleTidyTabs = async () => {
    setBusyAction('tidy');
    try {
      const windowId = state?.currentWindowId ?? (await getCurrentWindowId());
      const res = await sendMsg<TidyResult>({ type: 'TIDY_TABS', windowId });
      if (res.groupsCreated > 0) {
        showStatus(
          `${res.tabsGrouped}タブを${res.groupsCreated}グループに整理 (${res.engine})`,
        );
      } else {
        showStatus(res.note ?? '整理対象の未グループタブがありません', 'info');
      }
      await loadState();
    } finally {
      setBusyAction(null);
    }
  };

  const handleArchiveNow = async () => {
    setBusyAction('archive');
    try {
      const res = await sendMsg<{ archivedCount: number }>({ type: 'ARCHIVE_NOW' });
      showStatus(
        res.archivedCount > 0
          ? `${res.archivedCount}件の未グループタブをアーカイブしました`
          : '期限超過のタブはありませんでした',
        res.archivedCount > 0 ? 'ok' : 'info',
      );
      await loadState();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = async (id: string) => {
    await sendMsg({ type: 'RESTORE_ARCHIVED_TAB', id });
    await loadState();
  };

  const handleDelete = async (id: string) => {
    await sendMsg({ type: 'DELETE_ARCHIVED_TAB', id });
    await loadState();
  };

  const handleClearArchive = async () => {
    await sendMsg({ type: 'CLEAR_ARCHIVE' });
    showStatus('アーカイブを全削除しました', 'info');
    await loadState();
  };

  const handleCreateTabGroup = async (title: string) => {
    const name = title.trim();
    if (!name) return;
    setBusyAction('create-group');
    try {
      const res = await sendMsg<{ ok: boolean; error?: string }>({
        type: 'CREATE_TAB_GROUP',
        title: name,
      });
      if (res.ok) {
        showStatus(`タブグループ「${name}」を作成しました`);
        await loadState();
      } else {
        showStatus(res.error ?? 'タブグループの作成に失敗しました', 'err');
      }
    } finally {
      setBusyAction(null);
      setCreatingGroup(false);
      setPaletteQuery('');
      setPaletteOpen(false);
    }
  };

  const handleAddTabToGroup = async (groupId: number, groupTitle: string) => {
    setBusyAction(`add-group-${groupId}`);
    try {
      const res = await sendMsg<{ ok: boolean; error?: string }>({
        type: 'ADD_TAB_TO_GROUP',
        groupId,
      });
      if (res.ok) {
        showStatus(`現在のタブを「${groupTitle}」へ追加しました`);
        await loadState();
      } else {
        showStatus(res.error ?? 'グループへの追加に失敗しました', 'err');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleUngroupActiveTab = async () => {
    setBusyAction('ungroup');
    try {
      const res = await sendMsg<{ ok: boolean; error?: string }>({
        type: 'UNGROUP_TAB',
      });
      if (res.ok) {
        showStatus('現在のタブをグループから外しました');
        await loadState();
      } else {
        showStatus(res.error ?? 'グループ解除に失敗しました', 'err');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleCollapse = async (groupId: number, groupTitle: string) => {
    const res = await sendMsg<{ ok: boolean; collapsed?: boolean }>({
      type: 'TOGGLE_GROUP_COLLAPSE',
      groupId,
    });
    if (res.ok) {
      showStatus(
        `「${groupTitle}」を${res.collapsed ? '折りたたみました' : '展開しました'}`,
        'info',
      );
      await loadState();
    }
  };

  const handlePullTabHere = async (tabId: number) => {
    await sendMsg({
      type: 'PULL_TAB_HERE',
      tabId,
      targetWindowId: state?.currentWindowId,
    });
    window.close();
  };

  const handlePullGroupHere = async (groupId: number) => {
    await sendMsg({
      type: 'PULL_GROUP_HERE',
      groupId,
      targetWindowId: state?.currentWindowId,
    });
    window.close();
  };

  const executePaletteItem = async (
    item: PaletteItem,
    options?: { shiftKey?: boolean },
  ) => {
    if (item.kind === 'tab' && item.tabId != null && item.windowId != null) {
      if (options?.shiftKey && item.isOtherWindow) {
        await handlePullTabHere(item.tabId);
        return;
      }
      await sendMsg({
        type: 'SWITCH_TO_TAB',
        tabId: item.tabId,
        windowId: item.windowId,
      });
      window.close();
      return;
    }

    if (item.kind === 'archive' && item.archiveId) {
      await handleRestore(item.archiveId);
      window.close();
      return;
    }

    if (item.kind === 'open-url' && item.targetUrl) {
      await sendMsg({ type: 'OPEN_URL', url: item.targetUrl });
      window.close();
      return;
    }

    if (item.kind === 'action' && item.actionId) {
      if (item.actionId === 'create-group') {
        setCreatingGroup(true);
        setPaletteQuery('');
        setPaletteOpen(false);
        paletteInputRef.current?.focus();
        return;
      }

      setPaletteQuery('');
      setPaletteOpen(false);

      if (item.actionId.startsWith('create-group:')) {
        const name = item.actionId.slice('create-group:'.length);
        await handleCreateTabGroup(name);
      } else if (item.actionId.startsWith('add-to-group:')) {
        const groupId = Number(item.actionId.slice('add-to-group:'.length));
        await handleAddTabToGroup(groupId, item.groupTitle ?? 'グループ');
      } else if (item.actionId === 'ungroup-active-tab') {
        await handleUngroupActiveTab();
      } else if (item.actionId.startsWith('toggle-collapse:')) {
        const groupId = Number(item.actionId.slice('toggle-collapse:'.length));
        await handleToggleCollapse(groupId, item.groupTitle ?? 'グループ');
      } else if (item.actionId === 'copy-url') {
        await handleCopyUrl();
      } else if (item.actionId === 'reset-group-tab') {
        await handleResetGroupTab();
      } else if (item.actionId === 'set-group-home') {
        if (state?.activeTabId != null) {
          await handleSetGroupHome(state.activeTabId);
        }
      } else if (item.actionId === 'tidy-tabs') {
        await handleTidyTabs();
      } else if (item.actionId === 'archive-now') {
        await handleArchiveNow();
      } else if (item.actionId === 'open-options') {
        chrome.runtime.openOptionsPage();
      } else if (item.actionId.startsWith('unload-group:')) {
        const groupId = Number(item.actionId.slice('unload-group:'.length));
        await handleUnloadGroup(groupId, item.groupTitle ?? 'グループ');
      } else if (item.actionId.startsWith('pull-tab:')) {
        const tabId = Number(item.actionId.slice('pull-tab:'.length));
        await handlePullTabHere(tabId);
      } else if (item.actionId.startsWith('pull-group:')) {
        const groupId = Number(item.actionId.slice('pull-group:'.length));
        await handlePullGroupHere(groupId);
      }
    }
  };

  const handlePaletteKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (creatingGroup) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleCreateTabGroup(paletteQuery);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCreatingGroup(false);
        setPaletteQuery('');
      }
      return;
    }

    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      if (!isPaletteMode) {
        setPaletteOpen(true);
        setSelectedIndex(0);
      } else if (paletteItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % paletteItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      if (isPaletteMode && paletteItems.length > 0) {
        setSelectedIndex(
          (prev) => (prev - 1 + paletteItems.length) % paletteItems.length,
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isPaletteMode && paletteItems[selectedIndex]) {
        e.preventDefault();
        void executePaletteItem(paletteItems[selectedIndex], {
          shiftKey: e.shiftKey,
        });
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isPaletteMode) {
        e.preventDefault();
        setPaletteQuery('');
        setPaletteOpen(false);
      }
    }
  };

  return (
    <div className="flex h-[540px] flex-col bg-slate-950 text-slate-100">
      {/* Command Palette Bar */}
      <header className="border-b border-slate-800/90 bg-slate-900/70 p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Command className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
            <input
              ref={paletteInputRef}
              type="text"
              value={paletteQuery}
              onChange={(e) => {
                setPaletteQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handlePaletteKeyDown}
              placeholder={
                creatingGroup
                  ? 'New tab group name... (Enter to create, Esc to cancel)'
                  : 'Search tabs, actions, URLs... (> / @ / #)'
              }
              className={`w-full rounded-lg border bg-slate-950 py-1.5 pr-2.5 pl-8 text-xs text-slate-100 placeholder-slate-500 focus:outline-none ${
                creatingGroup
                  ? 'border-emerald-500 focus:border-emerald-400'
                  : 'border-slate-700/80 focus:border-indigo-500'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            title="設定を開く"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scope quick-filter pills */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setPaletteQuery('> ');
                setPaletteOpen(true);
                paletteInputRef.current?.focus();
              }}
              className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700"
            >
              &gt; Actions
            </button>
            <button
              type="button"
              onClick={() => {
                setPaletteQuery('@ ');
                setPaletteOpen(true);
                paletteInputRef.current?.focus();
              }}
              className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700"
            >
              @ Tabs
            </button>
            <button
              type="button"
              onClick={() => {
                setPaletteQuery('# ');
                setPaletteOpen(true);
                paletteInputRef.current?.focus();
              }}
              className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700"
            >
              # Archive
            </button>
          </div>
          <span className="text-[10px] text-slate-500">↑↓ 選択 · ↵ 実行</span>
        </div>
      </header>

      {/* Status Toast */}
      {status && (
        <div
          className={`mx-3 mt-2 rounded-md px-2.5 py-1.5 text-xs ${
            status.tone === 'err'
              ? 'border border-red-500/30 bg-red-500/15 text-red-300'
              : status.tone === 'info'
                ? 'border border-slate-700 bg-slate-800 text-slate-300'
                : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
          }`}
        >
          {status.text}
        </div>
      )}

      {/* Command Palette Results Mode */}
      {isPaletteMode ? (
        <main className="flex min-h-0 flex-1 flex-col p-2">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
            {paletteItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-xs text-slate-500">
                <Search className="mb-2 h-5 w-5 opacity-40" />
                <p>一致する候補がありません</p>
              </div>
            ) : (
              paletteItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    ref={isSelected ? selectedItemRef : null}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 transition ${
                      isSelected
                        ? 'bg-indigo-600/25 text-white ring-1 ring-indigo-500/50'
                        : 'text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => void executePaletteItem(item)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      {item.favIconUrl ? (
                        <img
                          src={item.favIconUrl}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm"
                        />
                      ) : item.kind === 'action' ? (
                        <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : item.kind === 'open-url' ? (
                        <Globe className="h-4 w-4 shrink-0 text-sky-400" />
                      ) : item.kind === 'archive' ? (
                        <Archive className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <div className="h-4 w-4 shrink-0 rounded-sm bg-slate-800" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {item.groupColor && item.groupTitle && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-slate-300">
                              <span
                                className={`h-2 w-2 rounded-full ${GROUP_DOT[item.groupColor]}`}
                              />
                              {item.groupTitle}
                            </span>
                          )}
                          <span className="truncate text-xs font-medium">
                            {item.title}
                          </span>
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.isOtherWindow && item.tabId != null && (
                        <button
                          type="button"
                          onClick={() => void handlePullTabHere(item.tabId!)}
                          className="inline-flex items-center gap-0.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300 hover:bg-indigo-500/35"
                          title="このウィンドウへ持ってくる (Shift+Enter)"
                        >
                          <ArrowDownLeft className="h-2.5 w-2.5" />
                          Pull
                        </button>
                      )}
                      {item.badge && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
                          {item.badge}
                        </span>
                      )}
                      {isSelected && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-indigo-300" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-slate-800/80 px-1 pt-1.5 text-[10px] text-slate-500">
            <span>
              {paletteItems[selectedIndex]?.isOtherWindow
                ? '↵ Switch · Shift+↵ Pull to this window'
                : 'Esc で通常ビューへ戻る'}
            </span>
            <span>{paletteItems.length} 件</span>
          </div>
        </main>
      ) : (
        <>
          {/* Quick Actions */}
          <section className="grid grid-cols-3 gap-2 border-b border-slate-800/80 bg-slate-900/40 p-2.5">
            <button
              type="button"
              onClick={() => void handleCopyUrl()}
              disabled={busyAction !== null}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-xs font-medium text-slate-200 transition hover:border-indigo-500/60 hover:bg-slate-800 disabled:opacity-50"
            >
              <Copy className="h-4 w-4 text-indigo-400" />
              <span>Copy URL</span>
            </button>

            <button
              type="button"
              onClick={() => void handleResetGroupTab()}
              disabled={busyAction !== null}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-500/60 hover:bg-slate-800 disabled:opacity-50"
              title="現在のグループ内タブをホームURLへ戻して休眠"
            >
              <RotateCcw className="h-4 w-4 text-amber-400" />
              <span>Reset & Sleep</span>
            </button>

            <button
              type="button"
              onClick={() => void handleTidyTabs()}
              disabled={busyAction !== null}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/60 hover:bg-slate-800 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span>Tidy {state ? `(${state.ungroupedCount})` : ''}</span>
            </button>
          </section>

          {/* Navigation Tabs */}
          <nav className="flex gap-1 px-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('groups')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                activeTab === 'groups'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>Groups ({totalGroupedTabs})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archive')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                activeTab === 'archive'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archive ({state?.archivedTabs.length ?? 0})</span>
            </button>
          </nav>

          {/* Main Body */}
          <main className="flex min-h-0 flex-1 flex-col p-3">
            {activeTab === 'groups' ? (
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                {(state?.tabGroups.length ?? 0) === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
                    <FolderKanban className="mb-2 h-6 w-6 opacity-40" />
                    <p>現在のウィンドウにタブグループがありません</p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      タブグループに入れたタブは自動でホームURL記憶・自動アーカイブ保護されます
                    </p>
                  </div>
                ) : (
                  state!.tabGroups.map((group) => (
                    <div
                      key={group.groupId}
                      className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
                          />
                          <span className="truncate text-xs font-semibold text-slate-200">
                            {group.title}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({group.tabs.length})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleUnloadGroup(group.groupId, group.title)
                          }
                          disabled={busyAction !== null}
                          className="flex shrink-0 items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-indigo-500/20 hover:text-indigo-200"
                          title="グループ内の全タブをホームURLへ戻して休眠・折りたたみ"
                        >
                          <Moon className="h-3 w-3" />
                          <span>一括休眠</span>
                        </button>
                      </div>

                      <div className="space-y-1">
                        {group.tabs.map((tab) => (
                          <div
                            key={tab.tabId}
                            className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-slate-800/70"
                          >
                            {tab.favIconUrl ? (
                              <img
                                src={tab.favIconUrl}
                                alt=""
                                className={`h-3.5 w-3.5 shrink-0 rounded-sm ${tab.discarded ? 'opacity-45' : ''}`}
                              />
                            ) : (
                              <div className="h-3.5 w-3.5 shrink-0 rounded-sm bg-slate-800" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`truncate text-xs ${
                                    tab.discarded
                                      ? 'text-slate-400'
                                      : 'font-medium text-slate-200'
                                  }`}
                                >
                                  {tab.title}
                                </span>
                                {tab.discarded && (
                                  <span className="shrink-0 rounded bg-slate-800 px-1 py-0.5 text-[9px] text-slate-400">
                                    休眠中
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-[10px] text-slate-500">
                                Home: {tab.homeUrl ?? '未設定'}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {(tab.isDrifted || !tab.discarded) && (
                                <button
                                  type="button"
                                  onClick={() => void handleResetGroupTab(tab.tabId)}
                                  disabled={busyAction !== null}
                                  className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/25"
                                  title="ホームURLへ戻して休眠"
                                >
                                  {tab.isDrifted ? '戻す' : '休眠'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleSetGroupHome(tab.tabId)}
                                className="rounded border border-slate-700 px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                                title="現在のURLをホームに設定"
                              >
                                <BookmarkCheck className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={archiveQuery}
                      onChange={(e) => setArchiveQuery(e.target.value)}
                      placeholder="アーカイブを検索..."
                      className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pr-2.5 pl-8 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleArchiveNow()}
                    disabled={busyAction !== null}
                    className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 transition hover:bg-slate-800"
                    title="期限超過の未グループタブを今すぐアーカイブ"
                  >
                    今すぐ整理
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
                  {filteredArchive.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
                      <Archive className="mb-2 h-6 w-6 opacity-40" />
                      <p>
                        {archiveQuery
                          ? '一致するアーカイブがありません'
                          : 'アーカイブされたタブはまだありません'}
                      </p>
                      {state && (
                        <p className="mt-1 text-[11px] text-slate-600">
                          未グループタブを未操作 {state.settings.autoArchive.idleHours}{' '}
                          時間で自動アーカイブ
                        </p>
                      )}
                    </div>
                  ) : (
                    filteredArchive.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-slate-800 hover:bg-slate-900"
                      >
                        {item.favIconUrl ? (
                          <img
                            src={item.favIconUrl}
                            alt=""
                            className="h-4 w-4 shrink-0 rounded-sm"
                          />
                        ) : (
                          <div className="h-4 w-4 shrink-0 rounded-sm bg-slate-800" />
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRestore(item.id)}
                          className="min-w-0 flex-1 text-left"
                          title={`復元: ${item.url}`}
                        >
                          <div className="truncate text-xs font-medium text-slate-200">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="truncate">{item.url}</span>
                            <span className="shrink-0">
                              · {formatRelativeTime(item.archivedAt)}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRestore(item.id)}
                          className="hidden rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-indigo-300 group-hover:block"
                          title="復元"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          className="hidden rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 group-hover:block"
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {(state?.archivedTabs.length ?? 0) > 0 && (
                  <div className="mt-2 flex justify-end border-t border-slate-800/80 pt-2">
                    <button
                      type="button"
                      onClick={() => void handleClearArchive()}
                      className="text-[11px] text-slate-500 transition hover:text-red-400"
                    >
                      アーカイブをすべて削除
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}
