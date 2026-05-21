export interface LaunchConfig {
  brand: {
    name: string;
    tagline: string;
    heroTitle: string;
    heroSubtitle: string;
  };
  freePlan: {
    dailyLikeLimit: number;
    dailyDirectMessageLimit: number;
    weeklyBoosts: number;
    features: string[];
  };
  plusPlan: {
    monthlyPrice: string;
    dailyDirectMessageLimit: number | null;
    weeklyBoosts: number;
    features: string[];
  };
}

export type VerificationStatus = "required" | "pending" | "verified";
export type NotificationKind = "like_received" | "match_created" | "message_received" | "direct_message_received";
export type GenderIdentity = "mujer" | "hombre" | "no-binaria" | "otra";
export type MessageKind = "text" | "image" | "voice";

export interface SessionData {
  token: string;
  user: {
    id: number;
    email: string;
    fullName: string;
    age: number;
    city: string;
    plan: "free" | "plus";
    isAdmin: boolean;
  };
  profile: {
    displayName: string;
    bio: string;
    city: string;
    intention: string;
    interests: string[];
    photos: string[];
    prompts: string[];
    values: string[];
    lifestyle: string[];
    zodiacSign: string;
    genderIdentity: GenderIdentity | "";
    seeking: GenderIdentity[];
    isVerified: boolean;
    verificationStatus: VerificationStatus;
    verificationSelfieUri: string;
    onboardingCompleted: boolean;
  };
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
  zodiacSign: string;
  genderIdentity: GenderIdentity | "";
  seeking: GenderIdentity[];
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

export interface DirectMessageResponse {
  directMessagesRemaining: number | null;
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

export interface Message {
  id: number;
  sender_user_id: number;
  content: string;
  created_at: string;
  message_type: MessageKind;
  media_uri: string;
  media_mime_type: string;
  media_duration_ms: number | null;
}

export interface MessageResponse {
  messages: Message[];
}

export interface ActivityItem {
  userId: number;
  displayName: string;
  city: string;
  primaryPhoto: string;
  createdAt: string;
}

export interface ActivityResponse {
  viewsReceived: ActivityItem[];
  viewsSent: ActivityItem[];
  likesReceived: ActivityItem[];
}

export interface UploadAssetResponse {
  path: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  matchId: number | null;
  actor: ActivityItem | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadByKind: Record<NotificationKind, number>;
}

export interface PushRegistrationResponse {
  ok: true;
}
