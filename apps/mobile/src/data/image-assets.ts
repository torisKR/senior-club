import type { ImageSource } from 'expo-image';

import { getMobileEnvironment } from '@/config/env';
import type { Club, Event } from '@/types';

export type AppImageSource = ImageSource | number;

// Unmodified copies of the web's public category references, available offline.
export const fallbackActivityImage = require('../../assets/images/club-senior-hero.jpg');

const categoryImages: Readonly<Record<string, number>> = {
  hiking: fallbackActivityImage,
  gardening: require('../../assets/images/event-gardening.jpg'),
  classical: require('../../assets/images/event-classical.jpg'),
  photo: require('../../assets/images/event-photo.jpg'),
  history: require('../../assets/images/event-history.jpg'),
  'rail-travel': require('../../assets/images/event-rail.jpg'),
  reading: require('../../assets/images/event-reading.jpg'),
};

// Older callers only pass an ID. Explicit API interests always take precedence.
const legacyEventCategories: Readonly<Record<string, string>> = {
  'event-garden-0719': 'gardening',
  'event-garden-0705': 'gardening',
  'event-classic-0723': 'classical',
  'event-classic-0624': 'classical',
  'event-hiking-0726': 'hiking',
  'event-photo-0802': 'photo',
};

const legacyClubCategories: Readonly<Record<string, string>> = {
  'club-garden': 'gardening',
  'club-classic': 'classical',
  'club-hiking': 'hiking',
  'club-photo': 'photo',
  'club-history': 'history',
  'club-railway': 'rail-travel',
};

const legacyPhotoCategories: Readonly<Record<string, string>> = {
  'garden-photo-1': 'gardening',
  'garden-photo-2': 'gardening',
  'classic-photo-1': 'classical',
  'classic-photo-2': 'classical',
  'hiking-photo-1': 'hiking',
  'hiking-photo-2': 'hiking',
};

export interface CoverImageSelection {
  source: AppImageSource;
  fallbackSource: number;
  isReference: boolean;
  sourceKey: string;
}

type EventImageInput = Pick<Event, 'id' | 'imageUri'> & Partial<Pick<Event, 'interestId'>>;
type ClubImageInput = Pick<Club, 'id' | 'imageUri'> & {
  interestId?: string;
  interest?: { slug: string };
  coverImageUrl?: string | null;
};

function ownValue<T>(values: Readonly<Record<string, T>>, key?: string): T | undefined {
  return key && Object.hasOwn(values, key) ? values[key] : undefined;
}

export function getCategoryImageSource(category?: string | null): number {
  return ownValue(categoryImages, category?.trim()) ?? fallbackActivityImage;
}

/** Root-relative API paths belong to the configured web origin, never a URL-provided host. */
function suppliedImage(uri?: string | null): ImageSource | undefined {
  const candidate = uri?.trim();
  if (!candidate || candidate.length > 2_048 || /[\u0000-\u001f\u007f\\]/.test(candidate)) {
    return undefined;
  }

  try {
    let parsed: URL;
    if (candidate.startsWith('/')) {
      if (candidate.startsWith('//')) return undefined;
      const pathname = candidate.split(/[?#]/, 1)[0];
      const unsafePath = pathname.split('/').some((segment) => {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f\\/]/.test(decoded);
      });
      if (unsafePath) return undefined;

      const origin = new URL(getMobileEnvironment().webUrl);
      if (origin.protocol !== 'https:' || origin.username || origin.password) return undefined;
      parsed = new URL(candidate, origin.origin);
      if (parsed.origin !== origin.origin) return undefined;
    } else {
      // Require a conventional absolute HTTPS URL; URL() also accepts some malformed variants.
      if (!/^https:\/\//i.test(candidate)) return undefined;
      parsed = new URL(candidate);
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return undefined;
    }
    return { uri: parsed.href, cacheKey: parsed.href };
  } catch {
    // Invalid paths or unavailable approved origins use the bundled reference.
    return undefined;
  }
}

export function selectCoverImage(imageUri?: string | null, category?: string | null): CoverImageSelection {
  const fallbackSource = getCategoryImageSource(category);
  const supplied = suppliedImage(imageUri);
  return {
    source: supplied ?? fallbackSource,
    fallbackSource,
    isReference: !supplied,
    sourceKey: JSON.stringify([supplied?.uri ?? null, fallbackSource]),
  };
}

export function getEventCoverImage(event: EventImageInput): CoverImageSelection {
  return selectCoverImage(event.imageUri, event.interestId ?? ownValue(legacyEventCategories, event.id));
}

export function getClubCoverImage(club: ClubImageInput): CoverImageSelection {
  return selectCoverImage(
    club.imageUri ?? club.coverImageUrl,
    club.interest?.slug ?? club.interestId ?? ownValue(legacyClubCategories, club.id),
  );
}

// Keep the source-only APIs for callers that do not render a cover.
export function getEventImageSource(event: EventImageInput): AppImageSource {
  return getEventCoverImage(event).source;
}

export function getClubImageSource(club: ClubImageInput): AppImageSource {
  return getClubCoverImage(club).source;
}

export function getClubPhotoImageSource(photoId: string, imageUri?: string): AppImageSource {
  return selectCoverImage(imageUri, ownValue(legacyPhotoCategories, photoId)).source;
}
