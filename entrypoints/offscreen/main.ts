import type { RuntimeMessage } from '../../lib/types';

async function copyText(text: string): Promise<{ ok: boolean; error?: string }> {
  const textarea = document.getElementById(
    'clipboard-buffer',
  ) as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.value = text;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    try {
      if (document.execCommand('copy')) {
        return { ok: true };
      }
    } catch {
      // Fall through to Clipboard API
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message?.type !== 'OFFSCREEN_COPY') return false;

  void copyText(message.text).then((result) => {
    sendResponse(result);
  });

  return true;
});
