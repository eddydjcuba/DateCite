import type { PublicProfile } from "./types";

export type MatchFilters = {
  radiusKm: number;
  minAge: string;
  maxAge: string;
  verifiedOnly: boolean;
  highConnectionOnly: boolean;
  interests: string[];
};

export const defaultMatchFilters: MatchFilters = {
  radiusKm: 55,
  minAge: "22",
  maxAge: "35",
  verifiedOnly: false,
  highConnectionOnly: false,
  interests: [],
};

export function cloneMatchFilters(filters: MatchFilters): MatchFilters {
  return {
    ...filters,
    interests: [...filters.interests],
  };
}

export function normalizeMatchFilters(filters: MatchFilters): MatchFilters {
  const minAge = Math.max(18, Number(filters.minAge) || 18);
  const maxAge = Math.max(minAge, Number(filters.maxAge) || minAge);

  return {
    ...filters,
    minAge: String(minAge),
    maxAge: String(maxAge),
    interests: [...new Set(filters.interests)],
  };
}

export function isMatchFiltersEqual(left: MatchFilters, right: MatchFilters): boolean {
  const a = normalizeMatchFilters(left);
  const b = normalizeMatchFilters(right);

  return (
    a.radiusKm === b.radiusKm &&
    a.minAge === b.minAge &&
    a.maxAge === b.maxAge &&
    a.verifiedOnly === b.verifiedOnly &&
    a.highConnectionOnly === b.highConnectionOnly &&
    a.interests.length === b.interests.length &&
    a.interests.every((interest, index) => interest === b.interests[index])
  );
}

export function countActiveMatchFilters(filters: MatchFilters): number {
  const normalized = normalizeMatchFilters(filters);
  let count = 0;

  if (normalized.radiusKm !== defaultMatchFilters.radiusKm) {
    count += 1;
  }

  if (normalized.minAge !== defaultMatchFilters.minAge || normalized.maxAge !== defaultMatchFilters.maxAge) {
    count += 1;
  }

  if (normalized.verifiedOnly) {
    count += 1;
  }

  if (normalized.highConnectionOnly) {
    count += 1;
  }

  if (normalized.interests.length > 0) {
    count += 1;
  }

  return count;
}

export function filterDiscoverProfiles(
  profiles: PublicProfile[],
  filters: MatchFilters,
  sessionCity?: string | null,
): PublicProfile[] {
  const normalized = normalizeMatchFilters(filters);
  const minAge = Number(normalized.minAge);
  const maxAge = Number(normalized.maxAge);
  const sameCityOnly = normalized.radiusKm <= 5;
  const normalizedSessionCity = sessionCity?.trim().toLowerCase() ?? "";

  return profiles.filter((profile) => {
    if (profile.age < minAge || profile.age > maxAge) {
      return false;
    }

    if (normalized.verifiedOnly && !profile.isVerified) {
      return false;
    }

    if (normalized.highConnectionOnly && profile.compatibilityScore < 88) {
      return false;
    }

    if (sameCityOnly && normalizedSessionCity && profile.city.trim().toLowerCase() !== normalizedSessionCity) {
      return false;
    }

    if (
      normalized.interests.length > 0 &&
      !normalized.interests.some((interest) => profile.interests.includes(interest))
    ) {
      return false;
    }

    return true;
  });
}
