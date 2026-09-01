import type { ImageSource } from 'expo-image';

import type { Club, Event } from '@/types';

export type AppImageSource = ImageSource | number;

export const fallbackActivityImage = require('@/assets/images/senior-club-hero-v2.jpg');

const gardeningImage = require('@/assets/images/event-gardening-v2.jpg');
const classicalImage = require('@/assets/images/event-classical-v2.jpg');

const eventImages: Record<string, AppImageSource> = {
  'event-garden-0719': gardeningImage,
  'event-garden-0705': gardeningImage,
  'event-classic-0723': classicalImage,
  'event-classic-0624': classicalImage,
  'event-hiking-0726': fallbackActivityImage,
  'event-photo-0802': fallbackActivityImage,
};

const clubImages: Record<string, AppImageSource> = {
  'club-garden': gardeningImage,
  'club-classic': classicalImage,
  'club-hiking': fallbackActivityImage,
  'club-photo': fallbackActivityImage,
  'club-history': fallbackActivityImage,
  'club-railway': fallbackActivityImage,
};

const clubPhotoImages: Record<string, AppImageSource> = {
  'garden-photo-1': gardeningImage,
  'garden-photo-2': gardeningImage,
  'classic-photo-1': classicalImage,
  'classic-photo-2': classicalImage,
  'hiking-photo-1': fallbackActivityImage,
  'hiking-photo-2': fallbackActivityImage,
};

function remoteImage(uri?: string): ImageSource | undefined {
  return uri ? { uri, cacheKey: uri } : undefined;
}

export function getEventImageSource(event: Pick<Event, 'id' | 'imageUri'>): AppImageSource {
  return eventImages[event.id] ?? remoteImage(event.imageUri) ?? fallbackActivityImage;
}

export function getClubImageSource(club: Pick<Club, 'id' | 'imageUri'>): AppImageSource {
  return clubImages[club.id] ?? remoteImage(club.imageUri) ?? fallbackActivityImage;
}

export function getClubPhotoImageSource(photoId: string, imageUri?: string): AppImageSource {
  return clubPhotoImages[photoId] ?? remoteImage(imageUri) ?? fallbackActivityImage;
}
