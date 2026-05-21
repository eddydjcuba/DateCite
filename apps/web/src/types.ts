export interface LaunchConfig {
  brand: {
    name: string;
    tagline: string;
    heroTitle: string;
    heroSubtitle: string;
  };
  market: {
    region: string;
    language: string;
    positioning: string;
  };
  promise: {
    headline: string;
    bullets: string[];
  };
  features: Array<{
    title: string;
    copy: string;
  }>;
  freePlan: {
    name: string;
    monthlyPrice: string;
    dailyLikeLimit: number;
    dailyDirectMessageLimit: number;
    weeklyBoosts: number;
    features: string[];
  };
  plusPlan: {
    name: string;
    monthlyPrice: string;
    dailyLikeLimit: number | null;
    dailyDirectMessageLimit: number | null;
    weeklyBoosts: number;
    features: string[];
  };
  safety: {
    title: string;
    items: string[];
  };
}

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  age: number;
  city: string;
  plan: "free" | "plus";
  isAdmin: boolean;
}

export interface SessionProfile {
  displayName: string;
  bio: string;
  city: string;
  intention: string;
  interests: string[];
  photos: string[];
  prompts: string[];
  values: string[];
  lifestyle: string[];
  isVerified: boolean;
  onboardingCompleted: boolean;
}

export type NotificationKind = "like_received" | "match_created" | "message_received" | "direct_message_received";

export interface SessionPayload {
  user: SessionUser;
  profile: SessionProfile;
}

export interface AuthResponse extends SessionPayload {
  token: string;
}

export interface PublicProfile {
  userId: number;
  displayName: string;
  age: number;
  city: string;
  bio: string;
  intention: string;
  interests: string[];
  photos: string[];
  prompts: string[];
  values: string[];
  lifestyle: string[];
  isVerified: boolean;
  compatibilityScore: number;
  compatibilityReasons: string[];
}

export interface DiscoverResponse {
  profiles: PublicProfile[];
  likesUsed: number;
  likesRemaining: number | null;
  directMessagesRemaining: number | null;
  isLimitReached: boolean;
}

export interface InteractionResponse {
  likesRemaining: number | null;
  newMatch: boolean;
  matchId: number | null;
  blockedByLimit: boolean;
}

export interface MatchSummary {
  id: number;
  createdAt: string;
  otherUser: PublicProfile;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface MatchListResponse {
  matches: MatchSummary[];
}

export interface MatchMessage {
  id: number;
  sender_user_id: number;
  content: string;
  created_at: string;
}

export interface MessageResponse {
  messages: MatchMessage[];
}

export interface AdminMetrics {
  totals: Record<string, number>;
  recentReports: Array<{
    reason: string;
    details: string;
    created_at: string;
    reporter_name: string;
    target_name: string;
  }>;
  recentLeads: Array<{
    name: string;
    email: string;
    city: string;
    note: string;
    created_at: string;
  }>;
}
