import { defineConfig, type WxtViteConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss() as unknown as NonNullable<WxtViteConfig['plugins']>[number]],
  }),
  manifest: {
    name: 'Arkee — Smart Tab Groups & Command Palette',
    description:
      'Command Palette, Tab Group Home URL Reset & Sleep, Auto-Archive, Quick Copy Clean URL, Air Traffic Control, and AI Tidy Tabs for Chrome.',
    permissions: [
      'tabs',
      'tabGroups',
      'storage',
      'alarms',
      'offscreen',
      'clipboardWrite',
      'activeTab',
      'scripting',
    ],
    optional_host_permissions: [
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.anthropic.com/*',
    ],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+A',
          mac: 'Command+Shift+A',
        },
        description: 'Open Arkee popup & archive search',
      },
      'quick-copy-url': {
        suggested_key: {
          default: 'Ctrl+Shift+C',
          mac: 'Command+Shift+C',
        },
        description: 'Copy current clean URL to clipboard',
      },
      'reset-group-tab': {
        suggested_key: {
          default: 'Ctrl+Shift+R',
          mac: 'Command+Shift+R',
        },
        description: 'Reset & unload active grouped tab to its home URL',
      },
      'tidy-tabs': {
        suggested_key: {
          default: 'Ctrl+Shift+T',
          mac: 'Command+Shift+T',
        },
        description: 'Group ungrouped tabs with AI Tidy Tabs',
      },
    },
  },
});
