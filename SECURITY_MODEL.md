# Arkee threat model

Arkee is a Chrome Manifest V3 extension for managing tabs and tab groups. This model covers the extension and the build and packaging workflows in this repository. Arkee has no application login or backend.

## Components and trust boundaries

| Component | Code | Entry points and trust boundaries |
| --- | --- | --- |
| Extension UI | `entrypoints/popup/`, `entrypoints/options/`, `lib/command-palette.ts` | The person using the Chrome profile opens the popup, types palette actions, and edits settings. The popup renders data that originates in web pages, including titles, URLs, and favicon references. It requests privileged actions through internal runtime messages. |
| Tab Management | `entrypoints/background.ts`, `lib/group-home.ts`, `lib/auto-archive.ts`, `lib/air-traffic-control.ts` | The service worker consumes Chrome lifecycle, tab, alarm, and keyboard events and calls privileged Chrome APIs. A site the user visits can influence tab metadata and navigation events. The extension UI can request archive, navigation, and tab or group changes. |
| Profile Storage | `lib/storage.ts`, `lib/types.ts` | `chrome.storage.local` persists settings, saved AI API keys, archived tabs, and group home records. `chrome.storage.session` tracks tab activity and routing state. Extension contexts read and write the records. Chrome’s native tab-group sync is a separate browser-managed boundary. |
| Clipboard | `lib/quick-copy.ts`, `lib/clean-url.ts`, `entrypoints/offscreen/` | A keyboard shortcut or popup action copies the active tab’s cleaned URL through an internal message to an offscreen document. The fallback injects a clipboard helper into the active tab. The optional toast writes to the active page’s DOM. |
| AI Tidy Tabs | `lib/tidy-tabs.ts` | A user action invokes Chrome’s on-device model or an optional provider. The prompt includes eligible tab IDs, hostnames, titles, and any custom hint. In bring-your-own-key (BYOK) mode, or auto mode with a configured key and no on-device result, that prompt and provider authentication cross the HTTPS boundary to Gemini, OpenAI, or Anthropic. Model output feeds tab-group changes. |
| Build and Distribution | `wxt.config.ts`, `package.json`, `pnpm-lock.yaml`, `.github/` | Repository changes and dependencies enter CI and the WXT build. Users install the packaged extension, whose manifest defines its permissions. The repository documents unpacked installation. Any other distribution process is unconfirmed. |

## Assets and attacker profiles

- Full open, archived, and group-home URLs, including any sensitive query parameters, plus titles, group names, and browsing activity. AI prompts contain hostnames and titles, and a URL can appear in title text when Chrome supplies no title.
- BYOK API keys, which can authorize provider usage and accrue charges. Chrome storage holds these keys as part of the settings object.
- Integrity and availability of navigation, tabs and archives, group membership, the clipboard, and the extension package users install.
- A hostile web origin the user visits can control its tab title and URL and influence updates Chrome reports. Treat these values as untrusted wherever the extension reads or displays them. Chrome gates privileged extension APIs. The source declares no general host access or public external message entry point.
- A provider or model may return malformed or misleading grouping data. A compromised dependency or maintainer/release account can affect what users install. An actor with prior local access to the Chrome profile has a different starting point from a website and must be assessed with that prerequisite.

## Existing controls

- `wxt.config.ts` limits optional provider host permissions to three HTTPS origins. The options UI requests the selected provider’s origin, and Chrome gates page script injection through `activeTab` and `scripting`.
- `lib/tidy-tabs.ts` restricts candidates to ungrouped, unpinned HTTP(S) tabs in the chosen window. The parser checks returned tab IDs against the candidate set and limits group titles and colors. Before grouping suggested tabs, Arkee rechecks that they are still ungrouped, unpinned, and in the target window. The default settings have no provider key.
- `lib/auto-archive.ts` protects active, pinned, and browser-internal tabs. The default settings also protect audible and grouped tabs. `lib/group-home.ts` captures HTTP(S) home URLs.
- `.github/workflows/ci.yml` runs tests, builds the package, audits production dependencies, and reviews dependency changes on pull requests. The maintainer’s `SECURITY.md` limits maintained versions to current `main`, directs vulnerability reports to GitHub private advisories, and limits accepted PRs to maintainers and automated Renovate updates.

## Scope and prioritization

All plausible attacker types and surfaces described above are in scope. Use the scanner’s severity for all assets and the component names above when tagging findings. The build and distribution model covers the checked-in CI, MV3 packaging, and documented unpacked installation.
