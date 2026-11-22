import { cleanUrl } from './clean-url';
import { getSettings } from './storage';
import type { CopyResult } from './types';

const OFFSCREEN_PATH = 'offscreen.html';

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Copy cleaned tab URL to clipboard from MV3 service worker',
  });
}

async function writeClipboardViaOffscreen(
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensureOffscreenDocument();
  let lastError = 'No response from offscreen document';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_COPY',
        text,
      })) as { ok?: boolean; error?: string } | undefined;
      if (response?.ok) return { ok: true };
      if (response?.error) lastError = response.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  return { ok: false, error: lastError };
}

async function writeClipboardViaActiveTab(
  tabId: number,
  text: string,
): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [text],
      func: async (value: string) => {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch {
          const el = document.createElement('textarea');
          el.value = value;
          el.setAttribute('readonly', '');
          el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
          document.body.appendChild(el);
          el.focus();
          el.select();
          const ok = document.execCommand('copy');
          el.remove();
          return ok;
        }
      },
    });
    return Boolean(results?.[0]?.result);
  } catch {
    return false;
  }
}

async function flashBadge(text: string, color: string): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' });
    }, 1600);
  } catch {
    // Ignore badge errors
  }
}

async function showPageToast(
  tabId: number,
  message: string,
  subtext: string,
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [message, subtext],
      func: (title: string, detail: string) => {
        const EXISTING_ID = '__arkee_copy_toast__';
        document.getElementById(EXISTING_ID)?.remove();

        const host = document.createElement('div');
        host.id = EXISTING_ID;
        host.style.cssText =
          'position:fixed;top:18px;right:18px;z-index:2147483647;pointer-events:none;';
        const shadow = host.attachShadow({ mode: 'closed' });

        const box = document.createElement('div');
        box.style.cssText = [
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
          'background:rgba(20,20,24,0.92)',
          'color:#f8fafc',
          'backdrop-filter:blur(10px)',
          'border:1px solid rgba(255,255,255,0.14)',
          'border-radius:12px',
          'padding:10px 14px',
          'box-shadow:0 12px 32px rgba(0,0,0,0.35)',
          'max-width:340px',
          'transition:opacity 180ms ease,transform 180ms ease',
          'opacity:0',
          'transform:translateY(-6px)',
        ].join(';');

        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        titleEl.style.cssText = 'font-size:13px;font-weight:600;line-height:1.3;';

        const detailEl = document.createElement('div');
        detailEl.textContent = detail;
        detailEl.style.cssText =
          'font-size:11px;color:#cbd5e1;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

        box.appendChild(titleEl);
        box.appendChild(detailEl);
        shadow.appendChild(box);
        document.documentElement.appendChild(host);

        requestAnimationFrame(() => {
          box.style.opacity = '1';
          box.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
          box.style.opacity = '0';
          box.style.transform = 'translateY(-6px)';
          setTimeout(() => host.remove(), 220);
        }, 1700);
      },
    });
  } catch {
    // Restricted pages (chrome://, Web Store, PDF) — badge fallback already shown
  }
}

export async function quickCopyActiveUrl(): Promise<CopyResult> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!activeTab?.url) {
    return { ok: false, error: 'No active tab URL' };
  }

  const settings = await getSettings();
  const { url, changed } = cleanUrl(activeTab.url, {
    enabled: settings.quickCopy.cleanTrackingParams,
    extraStripParams: settings.quickCopy.extraStripParams,
  });

  const isHttpTab =
    activeTab.id != null &&
    (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://'));

  try {
    const offscreenRes = await writeClipboardViaOffscreen(url);
    let copied = offscreenRes.ok;

    if (!copied && isHttpTab && activeTab.id != null) {
      copied = await writeClipboardViaActiveTab(activeTab.id, url);
    }

    if (!copied) {
      await flashBadge('!', '#ef4444');
      return {
        ok: false,
        url,
        cleaned: changed,
        error: `Clipboard write failed (${offscreenRes.error ?? 'unknown'})`,
      };
    }

    await flashBadge('✓', '#10b981');

    if (settings.quickCopy.showPageToast && isHttpTab && activeTab.id != null) {
      await showPageToast(
        activeTab.id,
        changed ? 'Clean URL Copied' : 'URL Copied',
        url,
      );
    }

    return { ok: true, url, cleaned: changed };
  } catch (err) {
    await flashBadge('!', '#ef4444');
    return {
      ok: false,
      url,
      cleaned: changed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
