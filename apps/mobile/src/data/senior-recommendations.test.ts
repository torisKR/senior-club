import { describe, expect, it } from 'vitest';
import {
  MOBILE_HIKING_COURSES,
  MOBILE_HOBBY_RECOMMENDATIONS,
} from './senior-recommendations';

describe('mobile senior recommendations', () => {
  it('provides safe, moderate hiking courses for seniors', () => {
    expect(MOBILE_HIKING_COURSES.length).toBeGreaterThanOrEqual(4);
    for (const course of MOBILE_HIKING_COURSES) {
      expect(course.title).toBeTruthy();
      expect(course.difficultyLabel).toBeTruthy();
      expect(course.features.length).toBeGreaterThan(0);
      expect(course.duration).toBeTruthy();
    }
  });

  it('provides active lifestyle hobby recommendations with valid actions', () => {
    expect(MOBILE_HOBBY_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(5);
    for (const hobby of MOBILE_HOBBY_RECOMMENDATIONS) {
      expect(hobby.name).toBeTruthy();
      expect(hobby.actionText).toBeTruthy();
      expect(hobby.benefits.length).toBeGreaterThan(0);
    }
  });
});
