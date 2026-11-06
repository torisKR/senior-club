import { describe, expect, it, vi } from 'vitest';
import { AppAnalytics, type AnalyticsSdk } from './controller';

function sdk(): AnalyticsSdk {
  return { consent: vi.fn(async () => {}), collection: vi.fn(async () => {}), reset: vi.fn(async () => {}), screen: vi.fn(async () => {}) };
}

describe('app consent and screen collection', () => {
  it('starts denied, normalizes screens, deduplicates renders and counts return visits', async () => {
    const api = sdk(); const load = vi.fn(async () => api); const client = new AppAnalytics(load);
    await client.view('/home');
    expect(load).not.toHaveBeenCalled();
    await client.setEnabled(true);
    await client.view('/home'); await client.view('/home');
    await client.view('/event/private-id?phone=01012345678');
    await client.view('/event/another-private-id');
    await client.view('/home');
    expect(api.screen).toHaveBeenCalledTimes(4);
    expect(api.screen).toHaveBeenNthCalledWith(2, 'event_detail');
    expect(JSON.stringify(vi.mocked(api.screen).mock.calls)).not.toMatch(/private|phone|010/);
    client.leaveForeground(); await client.view('/home');
    expect(api.screen).toHaveBeenCalledTimes(5);
    await client.setEnabled(false); await client.view('/me');
    expect(api.screen).toHaveBeenCalledTimes(5);
    expect(api.collection).toHaveBeenLastCalledWith(false);
    expect(api.reset).toHaveBeenCalledTimes(1);
  });

  it('withdrawal invalidates a pending SDK load and queued screen views', async () => {
    const api = sdk(); let resolve!: (value: AnalyticsSdk) => void;
    const client = new AppAnalytics(() => new Promise((done) => { resolve = done; }));
    const enabling = client.setEnabled(true);
    void client.view('/home');
    await Promise.resolve();
    const withdrawing = client.setEnabled(false);
    resolve(api); await enabling; await withdrawing;
    expect(api.collection).not.toHaveBeenCalledWith(true);
    expect(api.collection).toHaveBeenLastCalledWith(false);
    expect(api.screen).not.toHaveBeenCalled();
  });

  it('isolates missing native SDK failures from navigation and allows retry', async () => {
    const api = sdk(); const onError = vi.fn();
    const load = vi.fn().mockRejectedValueOnce(new Error('native module missing')).mockResolvedValue(api);
    const client = new AppAnalytics(load, onError);
    await client.setEnabled(true);
    expect(onError).toHaveBeenCalledTimes(1);
    await client.setEnabled(true); await client.view('/me');
    expect(api.screen).toHaveBeenCalledWith('profile');
    await client.view('/auth/continue?code=private');
    expect(api.screen).toHaveBeenCalledTimes(1);
  });
});
