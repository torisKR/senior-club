import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { PublicClub } from '@/api/clubs-api';

import {
  fallbackActivityImage,
  getCategoryImageSource,
  getClubCoverImage,
  getClubImageSource,
  getClubPhotoImageSource,
  getEventCoverImage,
  getEventImageSource,
  selectCoverImage,
} from './image-assets';

const fixtures = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  const assetRequire = createRequire(import.meta.url);
  const previousJpgLoader = assetRequire.extensions['.jpg'];
  const assets: Record<string, number> = {
    'club-senior-hero.jpg': 1,
    'event-gardening.jpg': 2,
    'event-classical.jpg': 3,
    'event-photo.jpg': 4,
    'event-history.jpg': 5,
    'event-rail.jpg': 6,
    'event-reading.jpg': 7,
  };
  // Metro returns numeric asset IDs; Node needs a test-only loader for bundled JPGs.
  assetRequire.extensions['.jpg'] = (assetModule, file) => {
    const name = file.split('/').at(-1)!;
    if (!Object.hasOwn(assets, name)) throw new Error(`Unexpected asset: ${file}`);
    assetModule.exports = assets[name];
  };
  return {
    assets,
    restoreAssetLoader: () => {
      if (previousJpgLoader) assetRequire.extensions['.jpg'] = previousJpgLoader;
      else delete assetRequire.extensions['.jpg'];
    },
    environment: vi.fn(() => ({
      appEnvironment: 'production',
      apiUrl: 'https://api.example.test/v1',
      webUrl: 'https://clubs.example.test',
    })),
  };
});

vi.mock('@/config/env', () => ({ getMobileEnvironment: fixtures.environment }));

afterAll(() => fixtures.restoreAssetLoader());

const categories = [
  ['hiking', 'club-senior-hero.jpg'],
  ['gardening', 'event-gardening.jpg'],
  ['classical', 'event-classical.jpg'],
  ['photo', 'event-photo.jpg'],
  ['history', 'event-history.jpg'],
  ['rail-travel', 'event-rail.jpg'],
  ['reading', 'event-reading.jpg'],
] as const;

describe('mobile cover selection', () => {
  it.each(categories)('uses the same unchanged web category asset for %s', (category, filename) => {
    expect(getCategoryImageSource(category)).toBe(fixtures.assets[filename]);
    const digest = (file: URL) => createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(digest(new URL(`../../assets/images/${filename}`, import.meta.url))).toBe(
      digest(new URL(`../../../../public/images/${filename}`, import.meta.url)),
    );
  });

  it.each(categories)('maps API event interestId and PublicClub interest.slug for %s', (category, filename) => {
    const club: PublicClub = {
      id: '51d7fd94-c9fe-40cb-99f4-4c1b3aef3310',
      slug: 'public-club', title: '공개 커뮤니티', description: '함께 즐겨요', region: '서울',
      interest: { id: 'opaque-interest-id', slug: category, name: '주제', icon: 'leaf', emoji: '🌱' },
      leaderName: '리더', memberCount: 12, upcomingEventCount: 0, pastEventCount: 0, nextEvent: null,
    };
    const expected = { source: fixtures.assets[filename], fallbackSource: fixtures.assets[filename], isReference: true };
    expect(getClubCoverImage(club)).toMatchObject(expected);
    expect(getClubCoverImage({ ...club, interestId: 'opaque-interest-id' })).toMatchObject(expected);
    expect(getEventCoverImage({ id: 'api-event-id', interestId: category })).toMatchObject(expected);
    expect(getClubImageSource({ id: 'domain-club', interestId: category })).toBe(expected.source);
  });

  it('prefers supplied HTTPS images over legacy IDs for events, clubs and photos', () => {
    const uri = 'https://cdn.example.test/real-photo.jpg?version=2';
    const source = { uri, cacheKey: uri };
    expect(getEventImageSource({ id: 'event-garden-0719', imageUri: ` ${uri} ` })).toEqual(source);
    expect(getClubImageSource({ id: 'club-classic', imageUri: uri })).toEqual(source);
    expect(getClubPhotoImageSource('garden-photo-1', uri)).toEqual(source);
    expect(getEventCoverImage({ id: 'event-garden-0719', imageUri: uri, interestId: 'reading' })).toMatchObject({
      source, fallbackSource: fixtures.assets['event-reading.jpg'], isReference: false,
    });
    expect(getClubCoverImage({ id: 'club-photo', coverImageUrl: uri, interest: { slug: 'history' } })).toMatchObject({
      source, fallbackSource: fixtures.assets['event-history.jpg'], isReference: false,
    });
  });

  it('resolves supplied root-relative photos against the approved web origin with a canonical cache key', () => {
    const uri = 'https://clubs.example.test/uploads/%EC%82%AC%EC%A7%84.jpg?version=3';
    expect(getEventImageSource({ id: 'event-garden-0719', imageUri: '/uploads/사진.jpg?version=3' })).toEqual({ uri, cacheKey: uri });
    expect(getClubImageSource({ id: 'club-classic', imageUri: '/custom/cover.jpg' })).toEqual({
      uri: 'https://clubs.example.test/custom/cover.jpg', cacheKey: 'https://clubs.example.test/custom/cover.jpg',
    });
  });

  it.each([
    '', '   ', 'http://cdn.example.test/photo.jpg', 'file:///private/photo.jpg',
    'data:image/png;base64,abc', 'content://photos/1', 'javascript:alert(1)',
    '//evil.example.test/photo.jpg', '/\\evil.example.test/photo.jpg',
    '/images/../private.jpg', '/images/%2e%2e/private.jpg', '/images/%2f%2fevil.test/photo.jpg',
    '/images/%5cevil.test/photo.jpg', '/images/%00photo.jpg', '/images/%zz.jpg',
    'https://user:password@cdn.example.test/photo.jpg', 'https:cdn.example.test/photo.jpg',
    'https://', 'https://cdn.example.test/\nphoto.jpg', 'x'.repeat(2_049),
  ])('rejects unsafe or unavailable sources and labels the category reference (%s)', (uri) => {
    expect(selectCoverImage(uri, 'photo')).toMatchObject({
      source: fixtures.assets['event-photo.jpg'], fallbackSource: fixtures.assets['event-photo.jpg'], isReference: true,
    });
  });

  it('uses local category references when a safe HTTPS relative origin is unavailable', () => {
    for (const webUrl of ['http://localhost:3000', 'https://user:password@clubs.example.test', 'invalid']) {
      fixtures.environment.mockReturnValueOnce({ appEnvironment: 'production', apiUrl: 'https://api.example.test', webUrl });
      expect(selectCoverImage('/photos/cover.jpg', 'classical').isReference).toBe(true);
    }
    fixtures.environment.mockImplementationOnce(() => { throw new Error('No configuration'); });
    expect(selectCoverImage('/photos/cover.jpg', 'classical').source).toBe(fixtures.assets['event-classical.jpg']);
    // An absolute HTTPS photo does not require API/web environment configuration.
    fixtures.environment.mockClear();
    expect(selectCoverImage('https://cdn.example.test/photo.jpg', 'photo').isReference).toBe(false);
    expect(fixtures.environment).not.toHaveBeenCalled();
  });

  it('preserves ID-only callers but lets explicit API categories override their legacy category', () => {
    expect(getEventImageSource({ id: 'event-garden-0719' })).toBe(fixtures.assets['event-gardening.jpg']);
    expect(getClubImageSource({ id: 'club-classic' })).toBe(fixtures.assets['event-classical.jpg']);
    expect(getClubPhotoImageSource('garden-photo-1')).toBe(fixtures.assets['event-gardening.jpg']);
    expect(getEventImageSource({ id: 'event-garden-0719', interestId: 'photo' })).toBe(fixtures.assets['event-photo.jpg']);
    expect(getClubImageSource({ id: 'club-garden', interest: { slug: 'reading' } })).toBe(fixtures.assets['event-reading.jpg']);
    expect(getClubImageSource({ id: 'club-garden', interest: { slug: 'unknown' } })).toBe(fallbackActivityImage);
  });

  it.each([undefined, null, '', 'unknown', 'constructor', '__proto__', 'toString'])('uses the forest reference for an unknown category %s', (category) => {
    expect(getCategoryImageSource(category)).toBe(fallbackActivityImage);
    expect(selectCoverImage(undefined, category).isReference).toBe(true);
  });

  it('changes request identity when the supplied URI or fallback category changes', () => {
    const first = selectCoverImage('https://cdn.example.test/a.jpg', 'photo');
    expect(selectCoverImage(' https://cdn.example.test/a.jpg ', 'photo').sourceKey).toBe(first.sourceKey);
    expect(selectCoverImage('https://cdn.example.test/b.jpg', 'photo').sourceKey).not.toBe(first.sourceKey);
    expect(selectCoverImage('https://cdn.example.test/a.jpg', 'reading').sourceKey).not.toBe(first.sourceKey);
  });
});
