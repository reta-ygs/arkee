import { describe, expect, it } from 'vitest';
import { cleanUrl } from '../lib/clean-url';

describe('cleanUrl', () => {
  it('strips default tracking parameters while preserving functional ones', () => {
    const res = cleanUrl(
      'https://example.com/article?id=42&utm_source=twitter&utm_medium=social&fbclid=abc123&page=2',
    );
    expect(res.changed).toBe(true);
    expect(res.url).toBe('https://example.com/article?id=42&page=2');
  });

  it('strips custom extra params case-insensitively', () => {
    const res = cleanUrl('https://example.com/?ref=nav&keep=1', {
      extraStripParams: ['REF'],
    });
    expect(res.changed).toBe(true);
    expect(res.url).toBe('https://example.com/?keep=1');
  });

  it('returns original URL untouched when disabled or non-http', () => {
    expect(cleanUrl('https://example.com/?utm_source=x', { enabled: false })).toEqual({
      url: 'https://example.com/?utm_source=x',
      changed: false,
    });
    expect(cleanUrl('chrome://extensions/?utm_source=x')).toEqual({
      url: 'chrome://extensions/?utm_source=x',
      changed: false,
    });
  });
});
