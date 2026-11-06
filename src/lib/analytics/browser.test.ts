// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://senior.toris.kr/login?code=private&phone=01012345678"}
import { beforeEach, describe, expect, it } from 'vitest';
import { analyticsChoice, measurementPage } from '../../../shared/analytics/measurement';
import { BrowserAnalytics } from './browser';

describe('safe analytics dimensions', () => {
  it('removes identity, content, search and OAuth values', () => {
    expect(measurementPage('/events/private-id?phone=01012345678#secret', 'web')).toEqual({ name: 'event_detail', title: '모임 자세히', path: '/events/[id]' });
    expect(measurementPage('/club/private-name/post/private-post?token=secret', 'android')?.path).toBe('/clubs/[slug]/posts/[id]');
    expect(measurementPage('/login?code=secret&state=private', 'web')?.path).toBe('/login');
    for (const path of ['/auth/continue?code=secret', '/api/me', '/admin', '/unknown/email@example.com']) {
      expect(measurementPage(path, 'web')).toBeNull();
    }
    expect(measurementPage('/', 'android')).toBeNull();
    expect(measurementPage('/index', 'web')?.path).toBe('/');
    expect(analyticsChoice('true')).toBe('unknown');
  });
});

describe('consent-only browser analytics', () => {
  let browser: Window;
  beforeEach(() => {
    browser = window;
    document.head.innerHTML = '';
    Reflect.deleteProperty(window, 'dataLayer');
    Reflect.deleteProperty(window, 'gtag');
  });
  const commands = () => (browser as unknown as { dataLayer: IArguments[] }).dataLayer.map((command) => Array.from(command));
  it('does not initialize before consent or in preview environments', () => {
    const client = new BrowserAnalytics(browser, 'G-TEST123');
    client.setEnabled(false, '/'); client.view('/events');
    expect(browser.document.scripts).toHaveLength(0);
    expect((browser as unknown as { dataLayer?: unknown }).dataLayer).toBeUndefined();
    expect(new BrowserAnalytics(browser, 'not-a-measurement-id').available).toBe(false);
    const preview = { location: { origin: 'https://preview.vercel.app', hostname: 'preview.vercel.app' }, document } as unknown as Window;
    new BrowserAnalytics(preview, 'G-TEST123').setEnabled(true, '/');
    expect(preview.document.scripts).toHaveLength(0);
  });
  it('counts one view per navigation, shares safe engagement dimensions and blocks after withdrawal', () => {
    const client = new BrowserAnalytics(browser, 'G-TEST123');
    client.setEnabled(true, '/login?code=private');
    client.setEnabled(true, '/login?code=private'); // Strict Mode replay / storage synchronization.
    client.view('/events/private-id?phone=01012345678');
    client.view('/events/private-id?phone=01012345678');
    client.view('/events/another-id');
    client.view('/login?code=different');
    const views = commands().filter((row) => row[0] === 'event');
    expect(views).toHaveLength(4);
    expect(browser.document.scripts).toHaveLength(1);
    expect(commands().find((row) => row[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, page_location: 'https://senior.toris.kr/login', page_referrer: '', allow_google_signals: false });
    expect(JSON.stringify(commands())).not.toMatch(/private-id|another-id|01012345678|code=|phone=/);
    browser.document.cookie = '_ga=test; path=/';
    browser.document.cookie = 'session=keep; path=/';
    client.setEnabled(false, '/login');
    client.view('/me');
    expect(commands().filter((row) => row[0] === 'event')).toHaveLength(4);
    expect(browser.document.cookie).not.toContain('_ga=');
    expect(browser.document.cookie).toContain('session=keep');
    client.setEnabled(true, '/me');
    expect(commands().filter((row) => row[0] === 'event')).toHaveLength(5);
    expect(browser.document.scripts).toHaveLength(1);
  });
});
