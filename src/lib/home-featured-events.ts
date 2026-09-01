import { isEventRegistrationOpen } from "@/lib/event-status";
import type { Event, InterestId } from "@/lib/types";

export const HOME_FEATURED_EVENT_STYLES = [
  {
    category: "hiking",
    accent: "var(--accent-soft)",
    fallbackImage: "/images/club-senior-hero.jpg",
    relatedTheme: "photo",
  },
  {
    category: "gardening",
    accent: "#e2f0df",
    fallbackImage: "/images/event-gardening.jpg",
  },
  {
    category: "classical",
    accent: "var(--sky-soft)",
    fallbackImage: "/images/event-classical.jpg",
  },
] satisfies Array<{
  category: InterestId;
  accent: string;
  fallbackImage: string;
  relatedTheme?: InterestId;
}>;

/** The exact verified events rendered by the home recommendation cards. */
export function getHomeFeaturedEvents(
  catalogEvents: readonly Event[],
  now: Date = new Date(),
): Event[] {
  return HOME_FEATURED_EVENT_STYLES.flatMap(({ category }) => {
    const event = catalogEvents.find(
      (candidate) =>
        candidate.category === category &&
        isEventRegistrationOpen(candidate, now),
    );
    return event ? [event] : [];
  });
}
