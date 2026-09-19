export const CATEGORY_COVER_IMAGES: Record<string, string> = {
  hiking: "/images/club-senior-hero.jpg",
  photo: "/images/event-photo.jpg",
  history: "/images/event-history.jpg",
  classical: "/images/event-classical.jpg",
  gardening: "/images/event-gardening.jpg",
  "rail-travel": "/images/event-rail.jpg",
  reading: "/images/event-reading.jpg",
};

export const DEFAULT_COVER_IMAGE = "/images/club-senior-hero.jpg";

/**
 * Returns a high-quality, authentic Korean senior cover image appropriate for the given category.
 * If the category does not have a dedicated image or is omitted, returns the default hero cover image.
 */
export function getCategoryCoverImage(category?: string | null): string {
  if (!category) return DEFAULT_COVER_IMAGE;
  return CATEGORY_COVER_IMAGES[category] ?? DEFAULT_COVER_IMAGE;
}

/**
 * Resolves an item's cover image: uses the item's own image if provided,
 * otherwise falls back to the category-specific cover image.
 */
export function resolveCoverImage(
  image?: string | null,
  category?: string | null,
): string {
  if (image && image.trim().length > 0) return image;
  return getCategoryCoverImage(category);
}
