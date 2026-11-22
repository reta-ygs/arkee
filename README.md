# Arkee

A lightweight Chrome Extension (Manifest V3) that upgrades Chrome's native **Vertical Tabs** and **Synced Tab Groups** with a keyboard-first workflow: Command Palette, Tab Group Home URLs & Sleep, Auto-Archive, Quick Copy Clean URL, Air Traffic Control, and AI Tidy Tabs.

---

## Features

1. **Command Palette (`Cmd+Shift+A` / `Ctrl+Shift+A`)**
   - Built directly into the extension popup — works everywhere, including `chrome://` pages and PDFs, with **no `<all_urls>` host permission**.
   - Fuzzy-search across open tabs, actions, and archived tabs (`↑`/`↓` or `Ctrl+P`/`Ctrl+N`, `Enter` to run).
   - Scope filters: `>` Actions, `@` Open Tabs, `#` Archive.
   - Tab Group actions: `Create New Tab Group` (or inline `new <name>`), `Add Tab to Group`, `Remove Tab from Group`, `Sleep Group`, `Collapse/Expand Group`.
   - Cross-window tab & group pulling: press **`Shift+Enter`** on an `Other Win` tab (or run `Pull Tab Here` / `Pull Group Here`) to bring tabs or entire tab groups into the current window.
2. **Tab Group Home URL & Sleep (`Cmd+Shift+R` / `Ctrl+Shift+R`)**
   - Automatically remembers each grouped tab's Home URL when added to a Chrome Tab Group (which syncs across Chrome browsers natively).
   - Reset a drifted tab back to its Home URL and unload (`chrome.tabs.discard`) it to free memory while keeping it in your tab list.
   - One-click **Sleep Group** resets, unloads, and collapses an entire Tab Group.
3. **Auto-Archive & Archive Search**
   - Periodically archives idle ungrouped tabs (default: 12 hours), while protecting active, pinned, audible, and grouped tabs by default.
   - Search and restore archived tabs anytime from the popup or Command Palette (`#`).
4. **Quick Copy Clean URL (`Cmd+Shift+C` / `Ctrl+Shift+C`)**
   - Copies the active tab's URL with tracking parameters (`utm_*`, `fbclid`, `gclid`, etc., plus custom params) stripped.
   - Uses MV3 Offscreen clipboard + active-tab fallback with subtle page toast & badge feedback.
5. **Air Traffic Control (URL Routing)**
   - Automatically routes newly opened URLs matching Glob or Regex rules into designated Chrome Tab Groups (name & color).
6. **AI Tidy Tabs (`Cmd+Shift+T` / `Ctrl+Shift+T`)**
   - Organizes ungrouped tabs into Chrome Tab Groups using **Chrome Built-in AI (`LanguageModel`)** first, with optional **BYOK** fallback (Google Gemini / OpenAI / Anthropic Claude) and deterministic domain grouping fallback.

---

## Keyboard Shortcuts

Default shortcuts (customizable at `chrome://extensions/shortcuts`):

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Open Command Palette & Popup | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Copy Clean URL | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Reset & Sleep Grouped Tab | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Run AI Tidy Tabs | `Cmd+Shift+T` | `Ctrl+Shift+T` |

> Note: Some `Cmd+Shift` / `Ctrl+Shift` combinations may overlap with Chrome built-in shortcuts depending on your OS/version. You can rebind them anytime at `chrome://extensions/shortcuts`.

---

## Permissions & Privacy

Arkee follows a strict minimal-permission design and does **not** request `<all_urls>`:

- `tabs`, `tabGroups`: Manage tabs, groups, discarding, and cross-window moves.
- `storage`, `alarms`: Store settings/archive/home URLs locally and schedule Auto-Archive.
- `offscreen`, `clipboardWrite`: Copy cleaned URLs reliably from the MV3 service worker.
- `activeTab`, `scripting`: Display the copy toast notification and clipboard fallback on the active tab.
- `optional_host_permissions`: Requested **only** if you opt into BYOK AI providers (`api.openai.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`).

All data stays local in your Chrome profile.

---

## Development

Requirements: Node.js 22+ and `pnpm`.

```bash
pnpm install
pnpm test        # Run unit tests (Vitest)
pnpm typecheck   # TypeScript type checking
pnpm build       # Build production MV3 bundle -> .output/chrome-mv3/
pnpm zip         # Package zip for distribution -> .output/
```

### Load in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.

---

## Pull Request Policy

External pull requests are not accepted. Only maintainer PRs and automated dependency updates (Renovate) are processed.

---

## License

This project is licensed under the **GNU General Public License v3.0** (`GPL-3.0-only`). See [LICENSE](./LICENSE) for details.
