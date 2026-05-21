export type DatingPlan = "free" | "plus";
export type InteractionAction = "like" | "pass";
export type VerificationStatus = "required" | "pending" | "verified";
export type NotificationKind = "like_received" | "match_created" | "message_received" | "direct_message_received";
export type GenderIdentity = "mujer" | "hombre" | "no-binaria" | "otra";
export type MessageKind = "text" | "image" | "voice";

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

export interface AuthUserPayload {
  id: number;
  email: string;
  fullName: string;
  age: number;
  city: string;
  plan: DatingPlan;
  isAdmin: boolean;
}

export interface SessionPayload {
  user: AuthUserPayload;
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

export interface MatchSummary {
  id: number;
  createdAt: string;
  otherUser: PublicProfile;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface MatchMessage {
  id: number;
  sender_user_id: number;
  content: string;
  created_at: string;
  message_type: MessageKind;
  media_uri: string;
  media_mime_type: string;
  media_duration_ms: number | null;
}

export interface ActivityItem {
  userId: number;
  displayName: string;
  city: string;
  primaryPhoto: string;
  createdAt: string;
}

export interface ActivityPayload {
  viewsReceived: ActivityItem[];
  viewsSent: ActivityItem[];
  likesReceived: ActivityItem[];
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

export interface NotificationsPayload {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadByKind: Record<NotificationKind, number>;
}
