import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Audio, type AVPlaybackStatus } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiRequest } from "./src/api";
import {
  cloneMatchFilters,
  countActiveMatchFilters,
  defaultMatchFilters,
  filterDiscoverProfiles,
  isMatchFiltersEqual,
  normalizeMatchFilters,
  type MatchFilters,
} from "./src/matchFilters";
import {
  clearStoredLoginMemory,
  clearStoredSessionToken,
  getStoredLoginMemory,
  getStoredSessionToken,
  saveStoredLoginMemory,
  saveStoredSessionToken,
} from "./src/sessionStore";
import type {
  ActivityItem,
  ActivityResponse,
  DirectMessageResponse,
  DiscoverResponse,
  GenderIdentity,
  InteractionResponse,
  LaunchConfig,
  MatchListResponse,
  MatchSummary,
  Message,
  MessageKind,
  MessageResponse,
  NotificationsResponse,
  PublicProfile,
  PushRegistrationResponse,
  SessionData,
  UploadAssetResponse,
} from "./src/types";

const DEFAULT_API_BASE = (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? "http://localhost:4000";
const DEFAULT_EAS_PROJECT_ID = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID as string | undefined)?.trim() ?? "";
const conexiaWelcomeImage = require("./assets/conexia-welcome.png");

const defaultLaunchConfig: LaunchConfig = {
  brand: {
    name: "Conexia",
    tagline: "Conoce con intencion",
    heroTitle: "",
    heroSubtitle: "",
  },
  freePlan: {
    dailyLikeLimit: 25,
    dailyDirectMessageLimit: 20,
    weeklyBoosts: 1,
    features: [],
  },
  plusPlan: {
    monthlyPrice: "9.99",
    dailyDirectMessageLimit: null,
    weeklyBoosts: 5,
    features: [],
  },
};

const zodiacOptions = [
  "aries",
  "tauro",
  "geminis",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "escorpio",
  "sagitario",
  "capricornio",
  "acuario",
  "piscis",
];

const interestOptions = [
  "Cafe",
  "Cine",
  "Musica",
  "Viajes",
  "Arte",
  "Running",
  "Cocina",
  "Brunch",
  "Libros",
  "Perros",
  "Yoga",
  "Gaming",
];

const lifestyleOptions = [
  "Tranquila",
  "Activa",
  "Creativa",
  "Social",
  "Noches suaves",
  "Tempranera",
];
const genderIdentityOptions: Array<{ key: GenderIdentity; label: string }> = [
  { key: "mujer", label: "Mujer" },
  { key: "hombre", label: "Hombre" },
  { key: "no-binaria", label: "No binarie" },
  { key: "otra", label: "Otra identidad" },
];
const profileReportOptions = [
  { key: "perfil-falso", label: "Perfil falso" },
  { key: "contenido-inapropiado", label: "Contenido inapropiado" },
  { key: "acoso-o-insultos", label: "Acoso o insultos" },
  { key: "spam", label: "Spam" },
  { key: "menor-de-edad", label: "Menor de edad" },
] as const;
type ProfileReportReason = (typeof profileReportOptions)[number]["key"];

const MIN_PROFILE_BIO_LENGTH = 12;
const MIN_PROFILE_INTERESTS = 1;
const MIN_PROFILE_PHOTOS = 2;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Flow = "welcome" | "login" | "register" | "complete-profile" | "verify" | "app";
type AppTab = "match" | "chat" | "activity" | "profile";
type WizardStep = "account" | "identity" | "tastes" | "photos";
type PushRegistrationReason = "ready" | "simulator" | "permission-denied" | "missing-project-id";
type ActivityView = "all" | "notifications" | "visits" | "likes";
type ProfileSection = "about" | "photos" | "account";
type ChatDraftPayload = {
  content?: string;
  messageType?: MessageKind;
  mediaUri?: string;
  mediaMimeType?: string;
  mediaDurationMs?: number | null;
};

type LoginForm = {
  email: string;
  password: string;
};

type AccountForm = {
  email: string;
  password: string;
  fullName: string;
};

type ProfileFormState = {
  displayName: string;
  city: string;
  age: string;
  zodiacSign: string;
  genderIdentity: GenderIdentity | "";
  seeking: GenderIdentity[];
  bio: string;
  prompt: string;
  interests: string[];
  lifestyle: string[];
  photos: string[];
};

type PushRegistrationResult = {
  expoPushToken: string | null;
  reason: PushRegistrationReason;
};

const emptyAccountForm: AccountForm = {
  email: "",
  password: "",
  fullName: "",
};

const emptyProfileForm: ProfileFormState = {
  displayName: "",
  city: "",
  age: "25",
  zodiacSign: "",
  genderIdentity: "",
  seeking: [],
  bio: "",
  prompt: "",
  interests: [],
  lifestyle: [],
  photos: ["", "", "", ""],
};

const radiusOptions = [5, 15, 55, 100];

function buildProfileForm(session: SessionData | null): ProfileFormState {
  return {
    displayName: session?.profile.displayName ?? "",
    city: session?.profile.city ?? "",
    age: session?.user.age ? String(session.user.age) : "25",
    zodiacSign: session?.profile.zodiacSign ?? "",
    genderIdentity: session?.profile.genderIdentity ?? "",
    seeking: session?.profile.seeking ?? [],
    bio: session?.profile.bio ?? "",
    prompt: session?.profile.prompts[0] ?? "",
    interests: session?.profile.interests ?? [],
    lifestyle: session?.profile.lifestyle ?? [],
    photos: [...(session?.profile.photos ?? []), "", "", "", ""].slice(0, 4),
  };
}

function resolveFlow(session: SessionData): Flow {
  if (!session.profile.onboardingCompleted) {
    return "complete-profile";
  }

  if (!session.profile.isVerified) {
    return "verify";
  }

  return "app";
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function toggleSelection(current: string[], value: string, max: number) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }

  return [...current, value].slice(0, max);
}

function formatMoment(value: string | null) {
  if (!value) {
    return "sin movimiento";
  }

  const date = new Date(value);
  const now = Date.now();
  const deltaMinutes = Math.max(1, Math.round((now - date.getTime()) / 60000));

  if (deltaMinutes < 60) {
    return `hace ${deltaMinutes} min`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `hace ${deltaHours} h`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `hace ${deltaDays} d`;
}

function fillPhotoSlots(photos: string[]) {
  return [...photos, "", "", "", ""].slice(0, 4);
}

function countSelectedPhotos(photos: string[]) {
  return fillPhotoSlots(photos).filter(Boolean).length;
}

function isUploadedMediaValue(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/media/");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function genderIdentityLabel(value: GenderIdentity | "") {
  return genderIdentityOptions.find((item) => item.key === value)?.label ?? "Sin definir";
}

function resolveExpoProjectId() {
  if (DEFAULT_EAS_PROJECT_ID) {
    return DEFAULT_EAS_PROJECT_ID;
  }

  if (Constants.easConfig?.projectId) {
    return Constants.easConfig.projectId;
  }

  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

function resolvePublicEntryFlow(): Flow {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "welcome";
  }

  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "login" || hash === "register" || hash === "welcome" || hash === "verify" || hash === "complete-profile") {
    return hash;
  }

  return "welcome";
}

function resolvePublicPreviewTab(): AppTab | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "filters") {
    return "match";
  }

  if (hash === "match" || hash === "chat" || hash === "activity" || hash === "profile") {
    return hash;
  }

  return null;
}

function formatDetectedLocation(place: Location.LocationGeocodedAddress | null | undefined) {
  if (!place) {
    return "";
  }

  const primary = place.city || place.subregion || place.region || "";
  const secondary = place.country || "";

  if (primary && secondary) {
    return `${primary}, ${secondary}`;
  }

  return primary || secondary;
}

function formatRemoteLocationLabel(address: Record<string, unknown> | null | undefined) {
  if (!address) {
    return "";
  }

  const primary =
    String(address.city ?? address.town ?? address.village ?? address.municipality ?? address.state ?? address.county ?? "").trim();
  const secondary = String(address.country ?? "").trim();

  if (primary && secondary) {
    return `${primary}, ${secondary}`;
  }

  return primary || secondary;
}

function getNotificationMatchId(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const rawMatchId = "matchId" in data ? (data as { matchId?: unknown }).matchId : null;
  const normalized = typeof rawMatchId === "number" || typeof rawMatchId === "string" ? Number(rawMatchId) : Number.NaN;

  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Conexia",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#8f2943",
    });
  }

  if (!Device.isDevice) {
    return {
      expoPushToken: null,
      reason: "simulator",
    };
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== "granted") {
    return {
      expoPushToken: null,
      reason: "permission-denied",
    };
  }

  const projectId = resolveExpoProjectId();
  try {
    const expoPushToken = projectId
      ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
      : (await Notifications.getExpoPushTokenAsync()).data;

    return {
      expoPushToken,
      reason: "ready",
    };
  } catch {
    return {
      expoPushToken: null,
      reason: "missing-project-id",
    };
  }
}

function AppButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "soft" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.buttonBase,
        tone === "primary" ? styles.buttonPrimary : tone === "soft" ? styles.buttonSoft : styles.buttonGhost,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === "primary" ? styles.buttonLabelPrimary : tone === "soft" ? styles.buttonLabelSoft : styles.buttonLabelGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  caption,
  children,
  tone = "light",
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <View style={[styles.sectionCard, tone === "dark" ? styles.sectionCardDark : null]}>
      <Text style={[styles.sectionTitle, tone === "dark" ? styles.sectionTitleDark : null]}>{title}</Text>
      {caption ? <Text style={[styles.sectionCaption, tone === "dark" ? styles.sectionCaptionDark : null]}>{caption}</Text> : null}
      {children}
    </View>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  multiline = false,
  autoCapitalize = "sentences",
  tone = "light",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  tone?: "light" | "dark";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, tone === "dark" ? styles.fieldLabelDark : null]}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.inputMultiline : null, tone === "dark" ? styles.inputDark : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tone === "dark" ? "rgba(255,255,255,0.42)" : "#7a6f76"}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  tone = "light",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: "light" | "dark";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choiceChip,
        tone === "dark" ? styles.choiceChipDark : null,
        selected ? (tone === "dark" ? styles.choiceChipDarkSelected : styles.choiceChipSelected) : null,
      ]}
    >
      <Text
        style={[
          styles.choiceChipText,
          tone === "dark" ? styles.choiceChipTextDark : null,
          selected ? (tone === "dark" ? styles.choiceChipTextDarkSelected : styles.choiceChipTextSelected) : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  title,
  copy,
  actionLabel,
  onPress,
}: {
  title: string;
  copy: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
      {actionLabel && onPress ? <AppButton label={actionLabel} onPress={onPress} tone="soft" /> : null}
    </View>
  );
}

function RomanticBackdrop() {
  return (
    <>
      <View style={[styles.blurOrb, styles.blurOrbTop]} />
      <View style={[styles.blurOrb, styles.blurOrbMiddle]} />
      <View style={[styles.blurOrb, styles.blurOrbBottom]} />
    </>
  );
}

function OnboardingBackdrop() {
  return (
    <>
      <LinearGradient colors={["#07040f", "#140713", "#220813"]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.onboardingBackdropGradient} />
      <View style={[styles.onboardingGlow, styles.onboardingGlowTop]} />
      <View style={[styles.onboardingGlow, styles.onboardingGlowMid]} />
      <View style={[styles.onboardingGlow, styles.onboardingGlowBottom]} />
      <View style={styles.onboardingBeam} />
    </>
  );
}

function WelcomeActionButton({
  label,
  onPress,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary";
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.welcomeButtonWrap, pressed ? styles.welcomeButtonPressed : null]}>
      {tone === "primary" ? (
        <LinearGradient colors={["#ff4f92", "#ff3f86", "#ff2d74"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.welcomeButtonCore}>
          <Text style={styles.welcomeButtonText}>{label}</Text>
          <View style={[styles.welcomeButtonArrowCircle, styles.welcomeButtonArrowCirclePrimary]}>
            <Text style={styles.welcomeButtonArrow}>{"\u2192"}</Text>
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.welcomeButtonCore, styles.welcomeButtonCoreSecondary]}>
          <Text style={styles.welcomeButtonText}>{label}</Text>
          <View style={styles.welcomeButtonArrowCircle}>
            <Text style={styles.welcomeButtonArrow}>{"\u2192"}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function SplashView({ brand }: { brand: LaunchConfig["brand"] }) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const halo = useRef(new Animated.Value(0.5)).current;
  const rise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.04,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(halo, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rise, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.94,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(halo, {
            toValue: 0.56,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rise, {
            toValue: 8,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [halo, rise, scale]);

  return (
    <View style={styles.splashWrap}>
      <Animated.View style={[styles.logoHalo, { opacity: halo, transform: [{ scale: halo }] }]} />
      <Animated.View style={[styles.logoCore, { transform: [{ scale }, { translateY: rise }] }]}>
        <Text style={styles.logoHeart}>{"\u2665"}</Text>
      </Animated.View>
      <Text style={styles.splashBrand}>{brand.name}</Text>
      <Text style={styles.splashCopy}>Cargando un espacio romantico, serio y simple de usar.</Text>
    </View>
  );
}

export default function App() {
  const [apiBase] = useState(DEFAULT_API_BASE);
  const [launchConfig, setLaunchConfig] = useState(defaultLaunchConfig);
  const [flow, setFlow] = useState<Flow>(() => resolvePublicEntryFlow());
  const [sessionRestored, setSessionRestored] = useState(false);
  const [tab, setTab] = useState<AppTab>(() => resolvePublicPreviewTab() ?? "match");
  const [session, setSession] = useState<SessionData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [wizardFeedback, setWizardFeedback] = useState<string | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [matchFilters, setMatchFilters] = useState<MatchFilters>(() => cloneMatchFilters(defaultMatchFilters));
  const [draftMatchFilters, setDraftMatchFilters] = useState<MatchFilters>(() => cloneMatchFilters(defaultMatchFilters));
  const [activityView, setActivityView] = useState<ActivityView>("all");
  const [focusedProfileId, setFocusedProfileId] = useState<number | null>(null);
  const [profileSection, setProfileSection] = useState<ProfileSection>("about");
  const [profilePreviewPhoto, setProfilePreviewPhoto] = useState<string | null>(null);
  const [matchPhotoIndex, setMatchPhotoIndex] = useState(0);
  const [showMatchPhotoViewer, setShowMatchPhotoViewer] = useState(false);
  const [showDirectMessageComposer, setShowDirectMessageComposer] = useState(false);
  const [directMessageDraft, setDirectMessageDraft] = useState("");
  const [reportTargetProfile, setReportTargetProfile] = useState<PublicProfile | null>(null);
  const [reportReason, setReportReason] = useState<ProfileReportReason>("perfil-falso");
  const [reportDetails, setReportDetails] = useState("");

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [wizardIndex, setWizardIndex] = useState(0);

  const [discover, setDiscover] = useState<DiscoverResponse | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationsResponse | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [messagesByMatchId, setMessagesByMatchId] = useState<Record<number, Message[]>>({});
  const [composer, setComposer] = useState("");

  const [showCamera, setShowCamera] = useState(false);
  const [verificationPhotoUri, setVerificationPhotoUri] = useState("");
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [audioPermission, requestAudioPermission] = Audio.usePermissions();
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const matchSwipe = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pushRegistrationKeyRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const selectedMatchIdRef = useRef<number | null>(null);
  const tabRef = useRef<AppTab>("match");
  const flowRef = useRef<Flow>(resolvePublicEntryFlow());
  const recordingRef = useRef<Audio.Recording | null>(null);
  const playingSoundRef = useRef<Audio.Sound | null>(null);

  sessionTokenRef.current = session?.token ?? null;
  selectedMatchIdRef.current = selectedMatchId;
  tabRef.current = tab;
  flowRef.current = flow;
  const previewMode = Platform.OS === "web" && resolvePublicPreviewTab() !== null;

  useEffect(() => {
    return () => {
      const activeRecording = recordingRef.current;
      if (activeRecording) {
        void activeRecording.stopAndUnloadAsync().catch(() => undefined);
      }

      const activeSound = playingSoundRef.current;
      if (activeSound) {
        void activeSound.unloadAsync().catch(() => undefined);
      }
    };
  }, []);

  const discoverProfilesSource = useMemo(() => {
    if ((discover?.profiles?.length ?? 0) > 0) {
      return discover?.profiles ?? [];
    }

    if (!previewMode) {
      return [];
    }

    const seen = new Set<number>();
    return matches
      .map((item) => item.otherUser)
      .filter((profile) => {
        if (seen.has(profile.userId)) {
          return false;
        }
        seen.add(profile.userId);
        return true;
      });
  }, [discover?.profiles, matches, previewMode]);

  const knownProfilesById = useMemo(() => {
    const map = new Map<number, PublicProfile>();

    for (const profile of discoverProfilesSource) {
      map.set(profile.userId, profile);
    }

    for (const item of matches) {
      map.set(item.otherUser.userId, item.otherUser);
    }

    return map;
  }, [discoverProfilesSource, matches]);

  const filteredProfiles = useMemo(
    () => filterDiscoverProfiles(discoverProfilesSource, matchFilters, session?.profile.city),
    [discoverProfilesSource, matchFilters, session?.profile.city],
  );

  const filteredMatches = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return matches;
    }

    return matches.filter((item) => {
      const haystack = [
        item.otherUser.displayName,
        item.otherUser.city,
        item.lastMessage ?? "",
        item.otherUser.interests.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [chatSearch, matches]);

  const activityPulse = useMemo(() => {
    const items = [...(activity?.likesReceived ?? []), ...(activity?.viewsReceived ?? []), ...(activity?.viewsSent ?? [])];
    const seen = new Set<number>();
    return items.filter((item) => {
      if (seen.has(item.userId)) {
        return false;
      }
      seen.add(item.userId);
      return true;
    }).slice(0, 5);
  }, [activity]);

  const activeFilterCount = useMemo(() => countActiveMatchFilters(matchFilters), [matchFilters]);
  const hasPendingFilterChanges = useMemo(() => !isMatchFiltersEqual(draftMatchFilters, matchFilters), [draftMatchFilters, matchFilters]);
  const focusedProfile = focusedProfileId ? knownProfilesById.get(focusedProfileId) ?? null : null;
  const currentProfile = focusedProfile ?? filteredProfiles[0] ?? null;
  const currentProfileMatch = currentProfile ? matches.find((item) => item.otherUser.userId === currentProfile.userId) ?? null : null;
  const currentProfilePhotos = currentProfile?.photos.filter(Boolean) ?? [];
  const activeMatchPhoto =
    currentProfilePhotos[matchPhotoIndex] ?? currentProfilePhotos[0] ?? "https://placehold.co/720x1040/120812/ff4f96?text=Conexia";
  const matchSwipeRotation = matchSwipe.x.interpolate({
    inputRange: [-160, 0, 160],
    outputRange: ["-10deg", "0deg", "10deg"],
    extrapolate: "clamp",
  });
  const matchSwipeLikeOpacity = matchSwipe.x.interpolate({
    inputRange: [16, 70, 130],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });
  const matchSwipePassOpacity = matchSwipe.x.interpolate({
    inputRange: [-130, -70, -16],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });
  const selectedMatch = matches.find((item) => item.id === selectedMatchId) ?? null;
  const activeMessages = selectedMatch ? messagesByMatchId[selectedMatch.id] ?? [] : [];
  const unreadChatByMatchId = useMemo(() => {
    const unreadMap = new Map<number, number>();

    for (const item of notifications?.notifications ?? []) {
      if (!item.isRead && item.matchId) {
        unreadMap.set(item.matchId, (unreadMap.get(item.matchId) ?? 0) + 1);
      }
    }

    return unreadMap;
  }, [notifications?.notifications]);
  const wizardSteps = useMemo<WizardStep[]>(
    () => (flow === "register" ? ["account", "identity", "tastes", "photos"] : ["identity", "tastes", "photos"]),
    [flow],
  );
  const activeStep = wizardSteps[wizardIndex] ?? wizardSteps[0];

  useEffect(() => {
    let live = true;

    apiRequest<LaunchConfig>(apiBase, "/api/launch-config")
      .then((payload) => {
        if (live) {
          setLaunchConfig(payload);
        }
      })
      .catch((error: Error) => {
        if (live) {
          setNotice(error.message);
        }
      });

    return () => {
      live = false;
    };
  }, [apiBase]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const syncFromHash = () => {
      const rawHash = window.location.hash.replace("#", "").toLowerCase();
      const previewTab = resolvePublicPreviewTab();
      const filterPreview = rawHash === "filters";
      if (previewTab) {
        setTab(previewTab);
        setShowFilters(filterPreview);
        if (sessionTokenRef.current) {
          setFlow("app");
        }
        return;
      }

      setShowFilters(false);
      setFlow(resolvePublicEntryFlow());
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    let live = true;

    void (async () => {
      const [storedToken, storedLoginMemory] = await Promise.all([getStoredSessionToken(), getStoredLoginMemory()]);

      if (!live) {
        return;
      }

      if (storedLoginMemory?.remember) {
        setLoginForm({
          email: storedLoginMemory.email,
          password: storedLoginMemory.password,
        });
        setRememberLogin(true);
      }

      if (storedToken) {
        try {
          await hydrateSession(storedToken);
        } catch {
          await clearStoredSessionToken();
          if (live) {
            setNotice("Tu sesion guardada ya no es valida. Entra otra vez.");
          }
        }
      }

      if (live) {
        setSessionRestored(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [apiBase]);

  useEffect(() => {
    if (!sessionRestored || Platform.OS !== "web") {
      return;
    }

    const previewTab = resolvePublicPreviewTab();
    if (!previewTab) {
      setShowFilters(false);
      return;
    }

    const filterPreview = typeof window !== "undefined" && window.location.hash.replace("#", "").toLowerCase() === "filters";
    setTab(previewTab);
    setShowFilters(filterPreview);
    if (session?.token) {
      setFlow("app");
      return;
    }

    let live = true;
    void (async () => {
      try {
        const payload = await apiRequest<SessionData>(apiBase, "/api/auth/login", {
          method: "POST",
          body: {
            email: "mateo@datecite.app",
            password: "DateCiteDemo123!",
          },
        });

        if (!live) {
          return;
        }

        await hydrateSession(payload.token, null, false);
        if (live) {
          setTab(previewTab);
          setFlow("app");
        }
      } catch (error) {
        if (live) {
          setNotice(error instanceof Error ? error.message : "No se pudo abrir la vista previa interna.");
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [apiBase, session?.token, sessionRestored]);

  useEffect(() => {
    if (!sessionRestored || !session) {
      return;
    }

    setFlow(resolveFlow(session));
  }, [session, sessionRestored]);

  useEffect(() => {
    if (!showFilters) {
      return;
    }

    setDraftMatchFilters(cloneMatchFilters(matchFilters));
  }, [matchFilters, showFilters]);

  useEffect(() => {
    const firstPhoto = session?.profile.photos.find(Boolean) ?? null;
    setProfilePreviewPhoto((current) => {
      if (current && session?.profile.photos.includes(current)) {
        return current;
      }

      return firstPhoto;
    });
  }, [session?.profile.photos]);

  useEffect(() => {
    setMatchPhotoIndex(0);
    setShowMatchPhotoViewer(false);
    setShowDirectMessageComposer(false);
    setDirectMessageDraft("");
    matchSwipe.setValue({ x: 0, y: 0 });
  }, [currentProfile?.userId, matchSwipe]);

  useEffect(() => {
    if (flow !== "app" || !session?.token) {
      return;
    }

    void loadProtectedData(session.token, null, true);
  }, [flow, session?.token]);

  useEffect(() => {
    if (!session?.token || tab !== "chat" || !selectedMatchId) {
      return;
    }

    const timer = setInterval(() => {
      void fetchMessages(selectedMatchId, session.token, true);
    }, 7000);

    return () => clearInterval(timer);
  }, [selectedMatchId, session?.token, tab]);

  useEffect(() => {
    if (tab !== "activity" || !notifications?.unreadCount) {
      return;
    }

    void markNotificationsAsRead(undefined, true);
  }, [notifications?.unreadCount, tab]);

  useEffect(() => {
    if (flow !== "app" || !session?.token || !session.user.id) {
      return;
    }

    const registrationKey = `${session.user.id}:${session.token}`;
    if (pushRegistrationKeyRef.current === registrationKey) {
      return;
    }

    pushRegistrationKeyRef.current = registrationKey;

    let live = true;

    void (async () => {
      try {
        const result = await registerForPushNotificationsAsync();
        if (!live) {
          return;
        }

        if (!result.expoPushToken) {
          if (result.reason === "permission-denied" && Platform.OS !== "web") {
            setNotice((current) => current ?? "Activa las notificaciones para enterarte al instante de likes, matches y mensajes.");
          }
          return;
        }

        await apiRequest<PushRegistrationResponse>(apiBase, "/api/devices/push-token", {
          method: "POST",
          token: session.token,
          body: {
            expoPushToken: result.expoPushToken,
            platform: Platform.OS,
            deviceName: Device.deviceName ?? "",
          },
        });
      } catch {
        if (live) {
          pushRegistrationKeyRef.current = null;
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [apiBase, flow, session?.token, session?.user.id]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const token = sessionTokenRef.current;
      const matchId = getNotificationMatchId(notification.request.content.data);

      if (!token || flowRef.current !== "app") {
        return;
      }

      void loadProtectedData(token, matchId, true);

      if (matchId && tabRef.current === "chat" && selectedMatchIdRef.current === matchId) {
        void fetchMessages(matchId, token, true);
        void markNotificationsAsRead({ matchId }, true, token);
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const token = sessionTokenRef.current;
      const matchId = getNotificationMatchId(response.notification.request.content.data);

      if (!token || flowRef.current !== "app") {
        return;
      }

      if (matchId) {
        setSelectedMatchId(matchId);
        setTab("chat");
        void loadProtectedData(token, matchId, true);
        void fetchMessages(matchId, token, true);
        void markNotificationsAsRead({ matchId }, true, token);
        return;
      }

      setTab("activity");
      void loadProtectedData(token, null, true);
      void markNotificationsAsRead(undefined, true, token);
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [apiBase]);

  async function loadProtectedData(token: string, preferredMatchId: number | null, silent = false) {
    try {
      const [discoverFeed, matchFeed, activityFeed, notificationFeed] = await Promise.all([
        apiRequest<DiscoverResponse>(apiBase, "/api/discover", { token }),
        apiRequest<MatchListResponse>(apiBase, "/api/matches", { token }),
        apiRequest<ActivityResponse>(apiBase, "/api/activity", { token }),
        apiRequest<NotificationsResponse>(apiBase, "/api/notifications", { token }),
      ]);

      setDiscover(discoverFeed);
      setMatches(matchFeed.matches);
      setActivity(activityFeed);
      setNotifications(notificationFeed);
      setSelectedMatchId((current) => {
        const candidate = preferredMatchId ?? current;
        if (candidate && matchFeed.matches.some((item) => item.id === candidate)) {
          return candidate;
        }

        return matchFeed.matches[0]?.id ?? null;
      });
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "No se pudo sincronizar la app.");
      }
    }
  }

  async function hydrateSession(token: string, preferredMatchId: number | null = null, persist = true) {
    const me = await apiRequest<Omit<SessionData, "token">>(apiBase, "/api/auth/me", { token });
    const nextSession = { ...me, token };
    if (persist) {
      await saveStoredSessionToken(token);
    } else {
      await clearStoredSessionToken();
    }
    setSession(nextSession);
    setProfileForm(buildProfileForm(nextSession));

    const nextFlow = resolveFlow(nextSession);
    setFlow(nextFlow);

    if (nextFlow === "app") {
      await loadProtectedData(token, preferredMatchId);
    } else {
      setDiscover(null);
      setMatches([]);
      setActivity(null);
      setNotifications(null);
    }

    return nextSession;
  }

  function collectUnreadNotificationIdsForActor(actorUserId: number) {
    return (notifications?.notifications ?? [])
      .filter((item) => !item.isRead && item.actor?.userId === actorUserId)
      .map((item) => item.id);
  }

  function resetRegisterFlow() {
    setAccountForm(emptyAccountForm);
    setProfileForm(emptyProfileForm);
    setWizardIndex(0);
    setNotice(null);
    setWizardFeedback(null);
    setVerificationFeedback(null);
    setIsResolvingLocation(false);
  }

  function openRegister() {
    resetRegisterFlow();
    setLoginFeedback(null);
    setFlow("register");
  }

  function openProfileCompletion() {
    setProfileForm(buildProfileForm(session));
    setWizardIndex(0);
    setWizardFeedback(null);
    setVerificationFeedback(null);
    setShowCamera(false);
    setFlow("complete-profile");
  }

  function closeWizardFlow() {
    setFlow(session ? "app" : "welcome");
    if (!session) {
      resetRegisterFlow();
    }
  }

  function goBackWizard() {
    setWizardFeedback(null);
    if (wizardIndex === 0) {
      closeWizardFlow();
      return;
    }

    setWizardIndex((current) => Math.max(0, current - 1));
  }

  function openFilters() {
    setDraftMatchFilters(cloneMatchFilters(matchFilters));
    setShowFilters(true);
  }

  function closeFilters() {
    setDraftMatchFilters(cloneMatchFilters(matchFilters));
    setShowFilters(false);
  }

  function resetDraftFilters() {
    setDraftMatchFilters(cloneMatchFilters(defaultMatchFilters));
  }

  function clearAppliedFilters() {
    const cleared = cloneMatchFilters(defaultMatchFilters);
    setMatchFilters(cleared);
    setDraftMatchFilters(cloneMatchFilters(cleared));
    setShowFilters(false);
    setNotice("Filtros limpiados.");
  }

  function applyFilters() {
    const nextFilters = normalizeMatchFilters(draftMatchFilters);
    if (isMatchFiltersEqual(nextFilters, matchFilters)) {
      setShowFilters(false);
      return;
    }

    const filteredCount = filterDiscoverProfiles(discoverProfilesSource, nextFilters, session?.profile.city).length;

    setMatchFilters(nextFilters);
    setDraftMatchFilters(cloneMatchFilters(nextFilters));
    setShowFilters(false);
    setNotice(filteredCount > 0 ? `${filteredCount} perfiles disponibles con tus filtros.` : "No hay perfiles con esos filtros ahora mismo.");
  }

  function openDiscoverProfile(userId: number, fallbackMessage = "Ese perfil no esta disponible ahora mismo.") {
    const profile = knownProfilesById.get(userId);
    if (!profile) {
      setNotice(fallbackMessage);
      return;
    }

    setFocusedProfileId(userId);
    setTab("match");
  }

  function openActivityItem(item: ActivityItem) {
    const match = matches.find((entry) => entry.otherUser.userId === item.userId);
    if (match) {
      void openMatchThread(match.id);
      return;
    }

    openDiscoverProfile(item.userId);
  }

  async function openNotificationItem(item: NotificationsResponse["notifications"][number]) {
    await markNotificationsAsRead({ ids: [item.id] });

    if (item.matchId) {
      await openMatchThread(item.matchId);
      return;
    }

    if (item.actor?.userId) {
      openDiscoverProfile(item.actor.userId);
      return;
    }

    setTab("activity");
  }

  function getActivityActionForUser(userId: number) {
    const relatedMatch = matches.find((entry) => entry.otherUser.userId === userId);

    if (relatedMatch) {
      return {
        label: "Abrir chat",
        onPress: () => {
          void openMatchThread(relatedMatch.id);
        },
      };
    }

    return {
      label: "Ver perfil",
      onPress: () => openDiscoverProfile(userId),
    };
  }

  async function useCurrentLocation() {
    setWizardFeedback(null);
    setIsResolvingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setWizardFeedback(
          permission.canAskAgain === false
            ? "La ubicacion quedo bloqueada para Conexia. Activa el permiso en ajustes o escribe tu ciudad manualmente."
            : "Activa la ubicacion para detectar tu ciudad o pais automaticamente.",
        );
        return;
      }

      let position: Location.LocationObject | null = null;

      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Platform.OS === "android" ? Location.Accuracy.Balanced : Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        });
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync();
        position = lastKnown ?? null;
      }

      if (!position) {
        setWizardFeedback(
          Platform.OS === "web"
            ? "No pudimos leer tu ubicacion en este navegador. Puedes escribirla manualmente o probarlo desde Expo Go."
            : "No pudimos leer tu ubicacion actual. Puedes escribirla manualmente.",
        );
        return;
      }

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let resolved = "";
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        resolved = formatDetectedLocation(places[0]);
      } catch {
        resolved = "";
      }

      if (!resolved) {
        try {
          const remote = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            {
              headers: {
                "Accept-Language": "es",
              },
            },
          );

          if (remote.ok) {
            const payload = (await remote.json()) as { address?: Record<string, unknown> };
            resolved = formatRemoteLocationLabel(payload.address);
          }
        } catch {
          resolved = "";
        }
      }

      if (!resolved) {
        setWizardFeedback(
          Platform.OS === "web"
            ? "No pudimos detectar tu ciudad en este navegador. Puedes escribirla manualmente o probarlo desde Expo Go."
            : "No pudimos detectar tu ciudad. Puedes escribirla manualmente.",
        );
        return;
      }

      setProfileForm((current) => ({
        ...current,
        city: resolved,
      }));
    } catch (error) {
      setWizardFeedback(error instanceof Error ? error.message : "No pudimos usar tu ubicacion ahora mismo.");
    } finally {
      setIsResolvingLocation(false);
    }
  }

  function profilePayloadFromForm() {
    return {
      displayName: profileForm.displayName.trim() || firstName(accountForm.fullName) || session?.profile.displayName || "",
      bio: profileForm.bio.trim(),
      city: profileForm.city.trim(),
      age: Number(profileForm.age),
      intention: "relacion-seria",
      genderIdentity: profileForm.genderIdentity,
      seeking: profileForm.seeking,
      interests: profileForm.interests,
      photos: fillPhotoSlots(profileForm.photos).filter(Boolean),
      prompts: [profileForm.prompt.trim()].filter(Boolean),
      values: ["Respeto", "Conexion real"],
      lifestyle: profileForm.lifestyle,
      zodiacSign: profileForm.zodiacSign,
    };
  }

  function buildUploadFileName(localUri: string, fallback: string) {
    const fileName = localUri.split("/").pop()?.split("?")[0];
    return fileName && fileName.includes(".") ? fileName : fallback;
  }

  function resolveMimeType(localUri: string, fallbackMimeType: string) {
    const normalized = localUri.toLowerCase();

    if (normalized.endsWith(".png")) {
      return "image/png";
    }

    if (normalized.endsWith(".webp")) {
      return "image/webp";
    }

    if (normalized.endsWith(".gif")) {
      return "image/gif";
    }

    if (normalized.endsWith(".mp3")) {
      return "audio/mpeg";
    }

    if (normalized.endsWith(".m4a") || normalized.endsWith(".mp4") || normalized.endsWith(".aac")) {
      return "audio/mp4";
    }

    if (normalized.endsWith(".ogg")) {
      return "audio/ogg";
    }

    if (normalized.endsWith(".wav")) {
      return "audio/wav";
    }

    if (normalized.endsWith(".webm")) {
      return fallbackMimeType.startsWith("audio/") ? "audio/webm" : "image/webp";
    }

    return fallbackMimeType;
  }

  function formatAudioDuration(durationMs: number | null | undefined) {
    const safeMs = typeof durationMs === "number" && Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const totalSeconds = Math.max(1, Math.round(safeMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async function uploadMediaFile(
    token: string,
    localUri: string,
    fallbackFileName: string,
    fallbackMimeType = "image/jpeg",
  ) {
    const formData = new FormData();
    const uploadName = buildUploadFileName(localUri, fallbackFileName);

    if (Platform.OS === "web" && (localUri.startsWith("blob:") || localUri.startsWith("data:"))) {
      const response = await fetch(localUri);
      if (!response.ok) {
        throw new Error("No pudimos leer el archivo seleccionado en el navegador.");
      }

      const blob = await response.blob();
      const mimeType = blob.type || resolveMimeType(localUri, fallbackMimeType);
      const extension = mimeType.includes("png")
        ? ".png"
        : mimeType.includes("webp")
          ? ".webp"
          : mimeType.includes("ogg")
            ? ".ogg"
            : mimeType.includes("mpeg")
              ? ".mp3"
              : mimeType.includes("wav")
                ? ".wav"
                : mimeType.includes("audio")
                  ? ".m4a"
                  : ".jpg";
      const safeName = uploadName.includes(".") ? uploadName : `${uploadName}${extension}`;
      formData.append("file", blob, safeName);
    } else {
      formData.append("file", {
        uri: localUri,
        name: uploadName,
        type: resolveMimeType(localUri, fallbackMimeType),
      } as never);
    }

    const payload = await apiRequest<UploadAssetResponse>(apiBase, "/api/uploads", {
      method: "POST",
      token,
      body: formData,
    });

    return payload.path;
  }

  async function normalizeUploadedPhotos(token: string, photos: string[]) {
    const slots = fillPhotoSlots(photos);

    const uploaded = await Promise.all(
      slots.map(async (photo, index) => {
        if (!photo) {
          return "";
        }

        if (isUploadedMediaValue(photo)) {
          return photo;
        }

        return uploadMediaFile(token, photo, index === 0 ? "profile-main.jpg" : `profile-wall-${index}.jpg`);
      }),
    );

    return uploaded.filter(Boolean);
  }

  function validateLoginForm() {
    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      return "Escribe tu correo y tu contrasena.";
    }

    if (!isValidEmail(loginForm.email)) {
      return "Ese correo no parece valido.";
    }

    return null;
  }

  function validateWizardStep(step: WizardStep) {
    if (step === "account") {
      if (!accountForm.email.trim() || !accountForm.password.trim() || !accountForm.fullName.trim()) {
        return "Completa correo, contrasena y tu nombre.";
      }

      if (!isValidEmail(accountForm.email)) {
        return "Usa un correo valido para crear la cuenta.";
      }

      if (accountForm.password.trim().length < 8) {
        return "La contrasena necesita al menos 8 caracteres.";
      }

      if (accountForm.fullName.trim().length < 2) {
        return "Escribe tu nombre completo.";
      }
    }

    if (step === "identity") {
      const age = Number(profileForm.age);
      if (!profileForm.displayName.trim()) {
        return "Falta tu nombre visible.";
      }

      if (!profileForm.city.trim()) {
        return "Necesitamos tu ciudad o pais para mostrarte gente afin.";
      }

      if (!Number.isFinite(age) || age < 18) {
        return "Conexia solo admite mayores de 18 anos.";
      }

      if (!profileForm.zodiacSign) {
        return "Elige tu signo zodiacal.";
      }

      if (!profileForm.genderIdentity) {
        return "Dinos como te identificas.";
      }

      if (profileForm.seeking.length < 1) {
        return "Elige al menos una opcion en lo que buscas.";
      }

      if (profileForm.bio.trim().length < MIN_PROFILE_BIO_LENGTH) {
        return `Tu descripcion debe tener al menos ${MIN_PROFILE_BIO_LENGTH} caracteres.`;
      }
    }

    if (step === "tastes") {
      if (profileForm.interests.length < MIN_PROFILE_INTERESTS) {
        return "Selecciona al menos 1 gusto real.";
      }
    }

    if (step === "photos") {
      const photos = fillPhotoSlots(profileForm.photos);
      if (!photos[0]) {
        return "Tu foto principal es obligatoria.";
      }

      if (countSelectedPhotos(photos) < MIN_PROFILE_PHOTOS) {
        return `Sube al menos ${MIN_PROFILE_PHOTOS} fotos para abrir tu perfil con buena presencia.`;
      }
    }

    return null;
  }

  function validateWizard() {
    for (const step of wizardSteps) {
      const errorMessage = validateWizardStep(step);
      if (errorMessage) {
        return errorMessage;
      }
    }

    return null;
  }

  function continueWizard() {
    const errorMessage = validateWizardStep(activeStep);
    if (errorMessage) {
      setWizardFeedback(errorMessage);
      return;
    }

    setWizardFeedback(null);
    if (wizardIndex < wizardSteps.length - 1) {
      setWizardIndex((current) => Math.min(wizardSteps.length - 1, current + 1));
      return;
    }

    void handleWizardSubmit();
  }

  async function handleLogin() {
    const errorMessage = validateLoginForm();
    if (errorMessage) {
      setLoginFeedback(errorMessage);
      return;
    }

    setBusyKey("login");
    setNotice(null);
    setLoginFeedback(null);

    try {
      const normalizedEmail = loginForm.email.trim().toLowerCase();
      const payload = await apiRequest<SessionData>(apiBase, "/api/auth/login", {
        method: "POST",
        body: {
          email: normalizedEmail,
          password: loginForm.password,
        },
      });

      if (rememberLogin) {
        await saveStoredLoginMemory({
          email: normalizedEmail,
          password: loginForm.password,
          remember: true,
        });
      } else {
        await clearStoredLoginMemory();
      }

      await hydrateSession(payload.token, null, rememberLogin);
    } catch (error) {
      setLoginFeedback(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleWizardSubmit() {
    const errorMessage = validateWizard();
    if (errorMessage) {
      setWizardFeedback(errorMessage);
      return;
    }

    setBusyKey("wizard");
    setWizardFeedback(null);
    setNotice(null);

    let createdToken: string | null = null;

    try {
      if (!session || flow === "register") {
        const registered = await apiRequest<SessionData>(apiBase, "/api/auth/register", {
          method: "POST",
          body: {
            email: accountForm.email.trim().toLowerCase(),
            password: accountForm.password,
            fullName: accountForm.fullName.trim(),
            displayName: profileForm.displayName.trim() || firstName(accountForm.fullName),
            age: Number(profileForm.age),
            city: profileForm.city.trim(),
          },
        });
        createdToken = registered.token;
        const uploadedPhotos = await normalizeUploadedPhotos(registered.token, profileForm.photos);

        const updated = await apiRequest<Omit<SessionData, "token">>(apiBase, "/api/profile", {
          method: "PUT",
          token: registered.token,
          body: {
            ...profilePayloadFromForm(),
            photos: uploadedPhotos,
          },
        });

        const nextSession = { ...updated, token: registered.token };
        setSession(nextSession);
        setProfileForm(buildProfileForm(nextSession));
        setFlow(resolveFlow(nextSession));
      } else {
        const uploadedPhotos = await normalizeUploadedPhotos(session.token, profileForm.photos);
        const updated = await apiRequest<Omit<SessionData, "token">>(apiBase, "/api/profile", {
          method: "PUT",
          token: session.token,
          body: {
            ...profilePayloadFromForm(),
            photos: uploadedPhotos,
          },
        });

        const nextSession = { ...updated, token: session.token };
        setSession(nextSession);
        setProfileForm(buildProfileForm(nextSession));

        const nextFlow = resolveFlow(nextSession);
        setFlow(nextFlow);
        if (nextFlow === "app") {
          await loadProtectedData(nextSession.token, selectedMatchId);
          setNotice("Perfil guardado.");
        }
      }
    } catch (error) {
      if (createdToken) {
        try {
          const me = await apiRequest<Omit<SessionData, "token">>(apiBase, "/api/auth/me", { token: createdToken });
          await saveStoredSessionToken(createdToken);
          setSession({ ...me, token: createdToken });
          setFlow("complete-profile");
          setWizardFeedback(
            error instanceof Error
              ? `La cuenta se creo, pero algo fallo al guardar el perfil: ${error.message}`
              : "La cuenta se creo, pero fallo la subida de alguna foto. Reintenta guardar el perfil.",
          );
          return;
        } catch {
          // Fall through to the generic error below.
        }
      }

      setWizardFeedback(error instanceof Error ? error.message : "No se pudo guardar tu perfil.");
    } finally {
      setBusyKey(null);
    }
  }

  async function pickPhoto(slot: number) {
    setWizardFeedback(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setWizardFeedback("Necesitas permiso de galeria para subir tus fotos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: slot === 0 ? [4, 5] : [1, 1],
      quality: 0.7,
    });

    const asset = result.assets?.[0];
    if (result.canceled || !asset) {
      return;
    }

    const photoValue = asset.uri ?? "";
    if (!photoValue) {
      setWizardFeedback("No pudimos procesar la foto seleccionada.");
      return;
    }

    setProfileForm((current) => {
      const nextPhotos = fillPhotoSlots(current.photos);
      nextPhotos[slot] = photoValue;
      return {
        ...current,
        photos: nextPhotos,
      };
    });
  }

  async function pickVerificationSelfieFromLibrary() {
    setVerificationFeedback(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setVerificationFeedback("Necesitas permiso de galeria para elegir una selfie ya tomada.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.7,
    });

    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) {
      return;
    }

    setVerificationPhotoUri(asset.uri);
    setShowCamera(false);
  }

  async function openCameraSettings() {
    try {
      if (Platform.OS === "web") {
        setVerificationFeedback("Tu navegador bloqueo la camara. Activa el permiso de camara para este sitio y vuelve a intentarlo.");
        return;
      }

      await Linking.openSettings();
    } catch {
      setVerificationFeedback("No pudimos abrir ajustes. Activa la camara manualmente y vuelve.");
    }
  }

  async function openCameraForVerification() {
    setVerificationFeedback(null);

    if (cameraPermission?.granted) {
      setShowCamera(true);
      return;
    }

    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain === false) {
      setVerificationFeedback(
        Platform.OS === "web"
          ? "Tu navegador bloqueo la camara. Activa el permiso de camara para este sitio."
          : "La camara quedo bloqueada. Activa el permiso en ajustes para seguir.",
      );
      return;
    }

    const response = await requestCameraPermission();
    if (!response.granted) {
      setVerificationFeedback(
        Platform.OS === "web"
          ? "Sin permiso de camara no podemos verificar la cuenta en este navegador."
          : "Sin permiso de camara no podemos verificar tu cuenta.",
      );
      return;
    }

    setShowCamera(true);
  }

  async function captureVerificationSelfie() {
    try {
      setVerificationFeedback(null);
      if (!cameraPermission?.granted) {
        const response = await requestCameraPermission();
        if (!response.granted) {
          setVerificationFeedback("La camara es obligatoria para verificar tu cuenta.");
          return;
        }
      }

      const capture = await cameraRef.current?.takePictureAsync({
        quality: 0.65,
      });

      const selfieValue = capture?.uri;
      if (!selfieValue) {
        setVerificationFeedback("No pudimos tomar la selfie. Intenta otra vez.");
        return;
      }

      setVerificationPhotoUri(selfieValue);
      setShowCamera(false);
    } catch (error) {
      setVerificationFeedback(error instanceof Error ? error.message : "No se pudo usar la camara.");
    }
  }

  async function confirmVerification() {
    if (!session || !verificationPhotoUri) {
      return;
    }

    setBusyKey("verify");
    setNotice(null);
    setVerificationFeedback(null);

    try {
      const uploadedSelfieUrl = isUploadedMediaValue(verificationPhotoUri)
        ? verificationPhotoUri
        : await uploadMediaFile(session.token, verificationPhotoUri, "verification-selfie.jpg");

      const updated = await apiRequest<Omit<SessionData, "token">>(apiBase, "/api/verification/complete", {
        method: "POST",
        token: session.token,
        body: {
          selfieUri: uploadedSelfieUrl,
        },
      });

      const nextSession = { ...updated, token: session.token };
      setSession(nextSession);
      setProfileForm(buildProfileForm(nextSession));
      setVerificationPhotoUri("");
      setFlow(resolveFlow(nextSession));
      setTab("match");
      await loadProtectedData(nextSession.token, null);
    } catch (error) {
      setVerificationFeedback(error instanceof Error ? error.message : "No se pudo verificar tu cuenta.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInteraction(action: "like" | "pass") {
    if (!session || !currentProfile) {
      return;
    }

    const actingProfileId = currentProfile.userId;
    const actingProfileName = currentProfile.displayName;
    const relatedNotificationIds = collectUnreadNotificationIdsForActor(actingProfileId);
    setBusyKey(action);
    setNotice(null);

    try {
      const result = await apiRequest<InteractionResponse>(apiBase, "/api/interactions", {
        method: "POST",
        token: session.token,
        body: {
          targetProfileId: currentProfile.userId,
          action,
        },
      });

      await loadProtectedData(session.token, result.matchId);
      setFocusedProfileId((current) => (current === actingProfileId ? null : current));

      if (relatedNotificationIds.length > 0) {
        await markNotificationsAsRead({ ids: relatedNotificationIds });
      }

      if (result.newMatch && result.matchId) {
        setTab("chat");
        setSelectedMatchId(result.matchId);
        await fetchMessages(result.matchId, session.token);
        await markNotificationsAsRead({ matchId: result.matchId });
        setNotice(`Nuevo match con ${actingProfileName}.`);
      } else if (action === "like") {
        setNotice("Like enviado.");
      } else {
        setNotice("Perfil descartado.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo registrar la accion.");
    } finally {
      setBusyKey(null);
    }
  }

  function openDirectMessageComposer(profile: PublicProfile) {
    setNotice(null);
    setDirectMessageDraft(`Hola ${firstName(profile.displayName)}, me llamaste la atencion y queria saludarte por aqui.`);
    setShowDirectMessageComposer(true);
  }

  function closeDirectMessageComposer() {
    if (busyKey === "direct-message") {
      return;
    }

    setShowDirectMessageComposer(false);
    setDirectMessageDraft("");
  }

  async function handleDirectMessage(profile: PublicProfile, rawContent: string) {
    if (!session) {
      return;
    }

    if (currentProfileMatch) {
      setNotice("Ese chat ya existe. Habla desde Mensajes.");
      return;
    }

    const content = rawContent.trim();
    if (content.length < 6) {
      setNotice("Tu mensaje inicial debe tener al menos 6 caracteres.");
      return;
    }

    setBusyKey("direct-message");
    setNotice(null);

    try {
      const relatedNotificationIds = collectUnreadNotificationIdsForActor(profile.userId);
      const result = await apiRequest<DirectMessageResponse>(apiBase, "/api/direct-messages", {
        method: "POST",
        token: session.token,
        body: {
          targetUserId: profile.userId,
          content,
        },
      });

      await loadProtectedData(session.token, selectedMatchId, true);
      if (relatedNotificationIds.length > 0) {
        await markNotificationsAsRead({ ids: relatedNotificationIds });
      }
      setShowDirectMessageComposer(false);
      setDirectMessageDraft("");
      setNotice(result.directMessagesRemaining === 0 ? "Mensaje inicial enviado. Ya llegaste al limite de hoy." : "Mensaje inicial enviado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el mensaje inicial.");
    } finally {
      setBusyKey(null);
    }
  }

  function handleReport(profile: PublicProfile) {
    if (!session) {
      return;
    }

    setNotice(null);
    setReportReason("perfil-falso");
    setReportDetails("");
    setReportTargetProfile(profile);
  }

  function closeReportComposer(force = false) {
    if (!force && busyKey === "report") {
      return;
    }

    setReportTargetProfile(null);
    setReportReason("perfil-falso");
    setReportDetails("");
  }

  async function submitProfileReport() {
    if (!session || !reportTargetProfile) {
      return;
    }

    setBusyKey("report");
    setNotice(null);

    try {
      await apiRequest(apiBase, "/api/reports", {
        method: "POST",
        token: session.token,
        body: {
          targetUserId: reportTargetProfile.userId,
          reason: reportReason,
          details: reportDetails.trim() || "Reporte enviado desde la app movil.",
        },
      });
      closeReportComposer(true);
      setNotice("Reporte enviado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el reporte.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBlock(profile: PublicProfile) {
    if (!session) {
      return;
    }

    Alert.alert("Bloquear perfil", `Quieres bloquear a ${profile.displayName}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Bloquear",
        style: "destructive",
        onPress: async () => {
          setBusyKey("block");
          setNotice(null);

          try {
            await apiRequest(apiBase, "/api/blocks", {
              method: "POST",
              token: session.token,
              body: {
                targetUserId: profile.userId,
              },
            });

            await loadProtectedData(session.token, selectedMatchId);
            setFocusedProfileId((current) => (current === profile.userId ? null : current));
            setNotice(`${profile.displayName} fue bloqueado.`);
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "No se pudo bloquear el perfil.");
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  }

  async function fetchMessages(matchId: number, token: string, silent = false) {
    try {
      const payload = await apiRequest<MessageResponse>(apiBase, `/api/matches/${matchId}/messages`, { token });
      setMessagesByMatchId((current) => ({
        ...current,
        [matchId]: payload.messages,
      }));
      if (tabRef.current === "chat" && selectedMatchIdRef.current === matchId) {
        void markNotificationsAsRead({ matchId }, true, token);
      }
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "No se pudo cargar el chat.");
      }
    }
  }

  async function markNotificationsAsRead(
    input?: { ids?: number[]; matchId?: number },
    silent = true,
    tokenOverride?: string,
  ) {
    const authToken = tokenOverride ?? session?.token;

    if (!authToken) {
      return;
    }

    try {
      const payload = await apiRequest<NotificationsResponse>(apiBase, "/api/notifications/read", {
        method: "POST",
        token: authToken,
        body: input ?? {},
      });
      setNotifications(payload);
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "No se pudieron actualizar las notificaciones.");
      }
    }
  }

  async function openMatchThread(matchId: number) {
    if (!session) {
      return;
    }

    setComposer("");
    setSelectedMatchId(matchId);
    setTab("chat");
    await fetchMessages(matchId, session.token);
    await markNotificationsAsRead({ matchId });
  }

  function openMatchPhotoViewer(index = 0) {
    if (!currentProfilePhotos.length) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, currentProfilePhotos.length - 1));
    setMatchPhotoIndex(safeIndex);
    setShowMatchPhotoViewer(true);
  }

  function closeMatchPhotoViewer() {
    setShowMatchPhotoViewer(false);
  }

  function moveMatchPhoto(offset: number) {
    if (!currentProfilePhotos.length) {
      return;
    }

    setMatchPhotoIndex((current) => {
      const total = currentProfilePhotos.length;
      const next = current + offset;
      if (next < 0) {
        return total - 1;
      }
      if (next >= total) {
        return 0;
      }
      return next;
    });
  }

  function resetMatchSwipe(animated = true) {
    if (!animated) {
      matchSwipe.setValue({ x: 0, y: 0 });
      return;
    }

    Animated.spring(matchSwipe, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      stiffness: 180,
      damping: 18,
      mass: 0.7,
    }).start();
  }

  function animateMatchDecision(action: "like" | "pass") {
    const targetX = action === "like" ? 420 : -420;
    Animated.timing(matchSwipe, {
      toValue: { x: targetX, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      void handleInteraction(action).finally(() => {
        matchSwipe.setValue({ x: 0, y: 0 });
      });
    });
  }

  const matchPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_event, gestureState) => {
          if (busyKey === "like" || busyKey === "pass") {
            return;
          }

          matchSwipe.setValue({
            x: gestureState.dx,
            y: Math.max(-20, Math.min(20, gestureState.dy * 0.15)),
          });
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (busyKey === "like" || busyKey === "pass") {
            resetMatchSwipe();
            return;
          }

          if (gestureState.dx >= 68) {
            animateMatchDecision("like");
            return;
          }

          if (gestureState.dx <= -68) {
            animateMatchDecision("pass");
            return;
          }

          resetMatchSwipe();
        },
        onPanResponderTerminate: () => {
          resetMatchSwipe();
        },
      }),
    [busyKey, matchSwipe],
  );

  async function sendMessagePayload(draft: ChatDraftPayload, options?: { clearComposer?: boolean }) {
    if (!session || !selectedMatchId) {
      return;
    }

    const matchId = selectedMatchId;
    setBusyKey("message");

    try {
      const response = await apiRequest<MessageResponse>(apiBase, `/api/matches/${matchId}/messages`, {
        method: "POST",
        token: session.token,
        body: draft,
      });

      setMessagesByMatchId((current) => ({
        ...current,
        [matchId]: response.messages,
      }));
      if (options?.clearComposer !== false) {
        setComposer("");
      }
      await loadProtectedData(session.token, matchId, true);
      await markNotificationsAsRead({ matchId }, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el mensaje.");
    } finally {
      setBusyKey(null);
    }
  }

  async function sendMessage(prefill?: string) {
    const content = (prefill ?? composer).trim();
    if (!content) {
      return;
    }

    await sendMessagePayload(
      {
        content,
        messageType: "text",
      },
      { clearComposer: !prefill },
    );
  }

  async function pickChatPhoto() {
    if (!session || !selectedMatchId || busyKey === "message" || busyKey === "message-photo") {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice("Permite acceso a fotos para enviar imagenes en el chat.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.88,
      allowsEditing: true,
      aspect: [4, 5],
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setBusyKey("message-photo");

    try {
      const asset = result.assets[0];
      const storedPath = await uploadMediaFile(session.token, asset.uri, "chat-photo.jpg", asset.mimeType || "image/jpeg");
      await sendMessagePayload(
        {
          content: "",
          messageType: "image",
          mediaUri: storedPath,
          mediaMimeType: asset.mimeType || resolveMimeType(asset.uri, "image/jpeg"),
        },
        { clearComposer: false },
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function stopPlayingSound() {
    const sound = playingSoundRef.current;
    playingSoundRef.current = null;
    setPlayingMessageId(null);

    if (sound) {
      try {
        await sound.stopAsync();
      } catch {}

      try {
        await sound.unloadAsync();
      } catch {}
    }
  }

  async function startVoiceRecording() {
    if (!session || !selectedMatchId || busyKey === "message" || recordingAudio) {
      return;
    }

    if (Platform.OS === "web" && !globalThis.isSecureContext) {
      setNotice("Para grabar audio en navegador necesitas abrir la app en un contexto seguro o usar Expo Go.");
      return;
    }

    let granted = audioPermission?.granted ?? false;
    if (!granted) {
      const requested = await requestAudioPermission();
      granted = requested.granted;
    }

    if (!granted) {
      setNotice("Debes permitir el microfono para enviar notas de voz.");
      return;
    }

    try {
      await stopPlayingSound();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setRecordingAudio(true);
      setNotice("Grabando nota de voz...");
    } catch (error) {
      recordingRef.current = null;
      setRecordingAudio(false);
      setNotice(error instanceof Error ? error.message : "No se pudo empezar a grabar.");
    }
  }

  async function stopVoiceRecordingAndSend() {
    if (!session || !selectedMatchId) {
      return;
    }

    const recording = recordingRef.current;
    if (!recording) {
      return;
    }

    recordingRef.current = null;
    setBusyKey("message-voice");

    try {
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const uri = recording.getURI();
      if (!uri) {
        throw new Error("No pudimos guardar la nota de voz.");
      }

      const mimeType =
        Platform.OS === "web"
          ? resolveMimeType(uri, "audio/webm")
          : resolveMimeType(uri, "audio/mp4");
      const storedPath = await uploadMediaFile(session.token, uri, "voice-note.m4a", mimeType);
      await sendMessagePayload(
        {
          content: "",
          messageType: "voice",
          mediaUri: storedPath,
          mediaMimeType: mimeType,
          mediaDurationMs: "durationMillis" in status ? status.durationMillis ?? null : null,
        },
        { clearComposer: false },
      );
      setNotice("Nota de voz enviada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar la nota de voz.");
    } finally {
      setRecordingAudio(false);
      setBusyKey(null);
    }
  }

  async function toggleVoiceRecording() {
    if (recordingAudio) {
      await stopVoiceRecordingAndSend();
      return;
    }

    await startVoiceRecording();
  }

  async function playVoiceMessage(message: Message) {
    if (message.message_type !== "voice" || !message.media_uri) {
      return;
    }

    if (playingMessageId === message.id) {
      await stopPlayingSound();
      return;
    }

    try {
      await stopPlayingSound();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: message.media_uri }, { shouldPlay: true });
      playingSoundRef.current = sound;
      setPlayingMessageId(message.id);
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          return;
        }

        if (status.didJustFinish) {
          setPlayingMessageId(null);
          if (playingSoundRef.current === sound) {
            playingSoundRef.current = null;
          }
          void sound.unloadAsync().catch(() => undefined);
        }
      });
    } catch (error) {
      setPlayingMessageId(null);
      setNotice(error instanceof Error ? error.message : "No se pudo reproducir el audio.");
    }
  }

  function reportPhotoMessage(message: Message) {
    if (!session || !selectedMatch || message.message_type !== "image") {
      return;
    }

    Alert.alert("Reportar foto", "Esta foto se enviara al panel de reportes para revision manual.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Reportar",
        style: "destructive",
        onPress: async () => {
          setBusyKey("report-photo");
          try {
            await apiRequest<{ ok: true }>(apiBase, "/api/reports", {
              method: "POST",
              token: session.token,
              body: {
                targetUserId: selectedMatch.otherUser.userId,
                reason: "foto_inapropiada",
                details: JSON.stringify({
                  surface: "chat-message-photo",
                  matchId: selectedMatch.id,
                  messageId: message.id,
                  mediaUri: message.media_uri,
                  mediaMimeType: message.media_mime_type,
                }),
              },
            });
            setNotice("Foto reportada para revision.");
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "No se pudo reportar la foto.");
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  }

  function logout() {
    const rememberedCredentials =
      rememberLogin && loginForm.email.trim() && loginForm.password.trim()
        ? {
            email: loginForm.email.trim().toLowerCase(),
            password: loginForm.password,
            remember: true as const,
          }
        : null;

    void clearStoredSessionToken();
    if (rememberedCredentials) {
      void saveStoredLoginMemory(rememberedCredentials);
    } else if (!rememberLogin) {
      void clearStoredLoginMemory();
    }
    void stopPlayingSound();
    if (recordingRef.current) {
      void recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      recordingRef.current = null;
    }
    setRecordingAudio(false);
    pushRegistrationKeyRef.current = null;
    setSession(null);
    setDiscover(null);
    setMatches([]);
    setActivity(null);
    setNotifications(null);
    setMessagesByMatchId({});
    setSelectedMatchId(null);
    setComposer("");
    setVerificationPhotoUri("");
    setShowCamera(false);
    setLoginForm(rememberedCredentials ? { email: rememberedCredentials.email, password: rememberedCredentials.password } : { email: "", password: "" });
    setLoginFeedback(null);
    setShowLoginPassword(false);
    setRememberLogin(rememberedCredentials ? true : rememberLogin);
    setIsResolvingLocation(false);
    setShowFilters(false);
    setChatSearch("");
    setMatchFilters(cloneMatchFilters(defaultMatchFilters));
    setDraftMatchFilters(cloneMatchFilters(defaultMatchFilters));
    setActivityView("all");
    setFocusedProfileId(null);
    setProfileSection("about");
    setProfilePreviewPhoto(null);
    setReportTargetProfile(null);
    setReportReason("perfil-falso");
    setReportDetails("");
    resetRegisterFlow();
    setTab("match");
    setFlow("welcome");
  }

  const isDarkStage =
    flow === "welcome" ||
    flow === "login" ||
    flow === "register" ||
    flow === "complete-profile" ||
    flow === "verify" ||
    flow === "app";

  async function deleteMyAccount() {
    if (!session) {
      return;
    }

    Alert.alert("Eliminar cuenta", "Esta accion borra tu cuenta de Conexia en este MVP.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          setBusyKey("delete-account");

          try {
            await apiRequest<{ ok: true }>(apiBase, "/api/account", {
              method: "DELETE",
              token: session.token,
            });
            logout();
            setNotice("Cuenta eliminada.");
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "No se pudo eliminar la cuenta.");
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  }

  function renderWelcome() {
    return (
      <View style={styles.welcomeStage}>
        <View style={styles.welcomeHeroImageWrap}>
          <Image source={conexiaWelcomeImage} style={styles.welcomeHeroImage} resizeMode="cover" />
        </View>
        <LinearGradient
          colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.0)", "rgba(0,0,0,0.55)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.welcomeImageShade}
        />

        <View style={styles.welcomeActionsDock}>
          <View style={styles.welcomeCtaStack}>
            <WelcomeActionButton
              label="Iniciar sesión"
              onPress={() => {
                setLoginFeedback(null);
                setFlow("login");
              }}
            />
            <WelcomeActionButton label="Registrarse" onPress={openRegister} tone="secondary" />
          </View>

          <View style={styles.welcomeHandle} />
        </View>
      </View>
    );
  }

  function renderLogin() {
    return (
      <View style={styles.loginStage}>
        <OnboardingBackdrop />
        <LinearGradient
          colors={["rgba(2,1,7,0.1)", "rgba(0,0,0,0.22)", "rgba(0,0,0,0.5)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.loginShade}
        />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.loginScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.loginTopBar}>
              <Pressable
                onPress={() => {
                  setLoginFeedback(null);
                  setFlow("welcome");
                }}
                style={styles.loginBackButton}
              >
                <Text style={styles.loginBackText}>Volver</Text>
              </Pressable>
            </View>

            <View style={styles.loginDock}>
              <View style={styles.loginHeroCard}>
                <Text style={styles.loginHeroKicker}>Conexia</Text>
                <Text style={styles.loginHeroTitle}>Vuelve a entrar</Text>
                <Text style={styles.loginHeroCopy}>Correo, contrasena y sigues donde lo dejaste.</Text>
              </View>

              {loginFeedback ? (
                <View style={styles.loginNoticeCard}>
                  <Text style={styles.loginNoticeText}>{loginFeedback}</Text>
                </View>
              ) : null}

              <View style={styles.loginFieldStack}>
                <View style={styles.loginFieldShell}>
                  <Ionicons name="mail-outline" size={27} color="#ff5ba1" style={styles.loginFieldIcon} />
                  <TextInput
                    value={loginForm.email}
                    onChangeText={(value) => {
                      setLoginFeedback(null);
                      setLoginForm((current) => ({ ...current, email: value }));
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Correo electronico"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    selectionColor="#ff5ba1"
                    style={styles.loginFieldInput}
                  />
                </View>

                <View style={styles.loginFieldShell}>
                  <Ionicons name="lock-closed-outline" size={27} color="#ff5ba1" style={styles.loginFieldIcon} />
                  <TextInput
                    value={loginForm.password}
                    onChangeText={(value) => {
                      setLoginFeedback(null);
                      setLoginForm((current) => ({ ...current, password: value }));
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Contrasena"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    selectionColor="#ff5ba1"
                    secureTextEntry={!showLoginPassword}
                    style={styles.loginFieldInputPassword}
                    onSubmitEditing={() => void handleLogin()}
                  />
                  <Pressable onPress={() => setShowLoginPassword((current) => !current)} style={styles.loginEyeButton}>
                    <Ionicons name={showLoginPassword ? "eye-off-outline" : "eye-outline"} size={28} color="rgba(255,255,255,0.62)" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.loginOptionsRow}>
                <Pressable
                  onPress={() => {
                    setRememberLogin((current) => {
                      const next = !current;
                      if (!next) {
                        void clearStoredLoginMemory();
                      }
                      return next;
                    });
                  }}
                  style={styles.loginRememberButton}
                >
                  <View style={[styles.loginRememberMark, rememberLogin ? styles.loginRememberMarkActive : null]}>
                    <Ionicons name="checkmark" size={16} color={rememberLogin ? "#ff5ba1" : "transparent"} />
                  </View>
                  <Text style={styles.loginRememberText}>Recordarme</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => void handleLogin()}
                disabled={busyKey === "login"}
                style={({ pressed }) => [styles.loginPrimaryButtonWrap, pressed ? styles.welcomeButtonPressed : null, busyKey === "login" ? styles.buttonDisabled : null]}
              >
                <LinearGradient
                  colors={["#ff5aa0", "#ff2f86", "#ec006b"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.loginPrimaryButton}
                >
                  <Ionicons name="sparkles-outline" size={27} color="#ffe7f2" style={styles.loginPrimaryIcon} />
                  <Text style={styles.loginPrimaryText}>{busyKey === "login" ? "Entrando..." : "Iniciar sesion"}</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={openRegister} style={styles.loginRegisterButton}>
                <Text style={styles.loginRegisterText}>
                  No tienes cuenta? <Text style={styles.loginRegisterAccent}>Registrate</Text>
                  <Text style={styles.loginRegisterAccent}> {" >"}</Text>
                </Text>
              </Pressable>
              <View style={styles.loginHandle} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderWizard() {
    const isRegister = flow === "register";
    const stepMeta: Record<WizardStep, { kicker: string; title: string; copy: string }> = {
      account: {
        kicker: "Paso 1",
        title: "Crea tu cuenta",
        copy: "Solo lo esencial para empezar. Rapido, claro y sin ruido.",
      },
      identity: {
        kicker: isRegister ? "Paso 2" : "Editar identidad",
        title: "Tu esencia",
        copy: "Nombre visible, ubicacion real, edad y una descripcion corta que suene a ti.",
      },
      tastes: {
        kicker: isRegister ? "Paso 3" : "Tus gustos",
        title: "Tu vibra",
        copy: "Un gusto real basta para empezar. Lo demas es opcional y lo puedes pulir luego.",
      },
      photos: {
        kicker: isRegister ? "Paso 4" : "Tus fotos",
        title: "Tu presencia",
        copy: "Empieza con tu foto principal y una mas. Luego completas el muro cuando quieras.",
      },
    };
    const stepRequirementCopy: Record<WizardStep, string> = {
      account: "Correo valido, clave 8+ y tu nombre.",
      identity: `Ciudad, 18+, signo, identidad, busqueda y bio de ${MIN_PROFILE_BIO_LENGTH}+ caracteres.`,
      tastes: "Elige al menos 1 gusto. La frase es opcional.",
      photos: `Tu principal y ${MIN_PROFILE_PHOTOS - 1} foto mas.`,
    };

    const currentStepMeta = stepMeta[activeStep];
    const formattedStep = `0${wizardIndex + 1}`.slice(-2);

    return (
      <View style={styles.wizardStage}>
        <OnboardingBackdrop />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.wizardScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.wizardTopBar}>
              <Pressable onPress={goBackWizard} style={styles.wizardBackButton}>
                <Text style={styles.wizardBackText}>{wizardIndex === 0 ? "Cancelar" : "Atras"}</Text>
              </Pressable>

              <View style={styles.wizardTopPill}>
                <Text style={styles.wizardTopPillText}>
                  {formattedStep}/{wizardSteps.length}
                </Text>
              </View>
            </View>

            <View style={styles.wizardHeroCardDark}>
              <Text style={styles.wizardHeroKickerDark}>{currentStepMeta.kicker}</Text>
              <Text style={styles.wizardHeroTitleDark}>{currentStepMeta.title}</Text>
              <Text style={styles.wizardHeroCopyDark}>{currentStepMeta.copy}</Text>

              <View style={styles.wizardProgressRowDark}>
                {wizardSteps.map((step, index) => (
                  <View key={step} style={[styles.wizardProgressDotDark, index <= wizardIndex ? styles.wizardProgressDotDarkActive : null]} />
                ))}
              </View>
            </View>

            <View style={styles.wizardRequirementCard}>
              <Ionicons name="sparkles-outline" size={16} color="#ff9dc4" />
              <Text style={styles.wizardRequirementText}>{stepRequirementCopy[activeStep]}</Text>
            </View>

            {wizardFeedback ? (
              <View style={styles.wizardFeedbackCard}>
                <Text style={styles.wizardFeedbackText}>{wizardFeedback}</Text>
              </View>
            ) : null}

            {activeStep === "account" ? (
              <SectionCard tone="dark" title="Cuenta base" caption="Correo, contrasena y nombre real. Nada mas para abrir la cuenta.">
                <InputField
                  tone="dark"
                  label="Correo"
                  value={accountForm.email}
                  onChangeText={(value) => {
                    setWizardFeedback(null);
                    setAccountForm((current) => ({ ...current, email: value }));
                  }}
                  placeholder="tu@correo.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <InputField
                  tone="dark"
                  label="Contrasena"
                  value={accountForm.password}
                  onChangeText={(value) => {
                    setWizardFeedback(null);
                    setAccountForm((current) => ({ ...current, password: value }));
                  }}
                  placeholder="Minimo 8 caracteres"
                  autoCapitalize="none"
                  secureTextEntry
                />
                <InputField
                  tone="dark"
                  label="Nombre"
                  value={accountForm.fullName}
                  onChangeText={(value) => {
                    setWizardFeedback(null);
                    setAccountForm((current) => ({ ...current, fullName: value }));
                    setProfileForm((current) => ({
                      ...current,
                      displayName: current.displayName || firstName(value),
                    }));
                  }}
                  placeholder="Como te llamas"
                  autoCapitalize="words"
                />
              </SectionCard>
            ) : null}

            {activeStep === "identity" ? (
              <>
                <SectionCard tone="dark" title="Tu carta principal" caption="Esto es lo primero que va a leer la otra persona.">
                  <InputField
                    tone="dark"
                    label="Nombre visible"
                    value={profileForm.displayName}
                    onChangeText={(value) => {
                      setWizardFeedback(null);
                      setProfileForm((current) => ({ ...current, displayName: value }));
                    }}
                    placeholder="Ej. Elena"
                    autoCapitalize="words"
                  />
                  <InputField
                    tone="dark"
                    label="Ciudad o pais"
                    value={profileForm.city}
                    onChangeText={(value) => {
                      setWizardFeedback(null);
                      setProfileForm((current) => ({ ...current, city: value }));
                    }}
                    placeholder="Bogota, Colombia"
                    autoCapitalize="words"
                  />
                  <Pressable
                    onPress={() => void useCurrentLocation()}
                    disabled={isResolvingLocation}
                    style={({ pressed }) => [
                      styles.locationAssistButton,
                      pressed && !isResolvingLocation ? styles.welcomeButtonPressed : null,
                      isResolvingLocation ? styles.buttonDisabled : null,
                    ]}
                  >
                    <Ionicons name="locate-outline" size={18} color="#ffb8d3" />
                    <Text style={styles.locationAssistButtonText}>{isResolvingLocation ? "Buscando ubicacion..." : "Usar ubicacion actual"}</Text>
                  </Pressable>
                  <InputField
                    tone="dark"
                    label="Edad"
                    value={profileForm.age}
                    onChangeText={(value) => {
                      setWizardFeedback(null);
                      setProfileForm((current) => ({ ...current, age: value.replace(/[^0-9]/g, "") }));
                    }}
                    placeholder="25"
                    keyboardType="numeric"
                    autoCapitalize="none"
                  />
                  <InputField
                    tone="dark"
                    label="Breve descripcion"
                    value={profileForm.bio}
                    onChangeText={(value) => {
                      setWizardFeedback(null);
                      setProfileForm((current) => ({ ...current, bio: value }));
                    }}
                    placeholder="Describe tu vibra en pocas lineas."
                    multiline
                  />
                </SectionCard>

                <SectionCard tone="dark" title="Signo zodiacal" caption="Rapido, ligero y dentro del mismo flow.">
                  <View style={styles.chipGrid}>
                    {zodiacOptions.map((sign) => (
                      <ChoiceChip
                        key={sign}
                        tone="dark"
                        label={`${sign.charAt(0).toUpperCase()}${sign.slice(1)}`}
                        selected={profileForm.zodiacSign === sign}
                        onPress={() => {
                          setWizardFeedback(null);
                          setProfileForm((current) => ({ ...current, zodiacSign: sign }));
                        }}
                      />
                    ))}
                  </View>
                </SectionCard>

                <SectionCard tone="dark" title="Identidad y busqueda" caption="Elige una identidad para ti y todas las opciones que te interesan conocer.">
                  <Text style={styles.inlineFieldLabel}>Como te identificas</Text>
                  <View style={styles.chipGrid}>
                    {genderIdentityOptions.map((item) => (
                      <ChoiceChip
                        key={item.key}
                        tone="dark"
                        label={item.label}
                        selected={profileForm.genderIdentity === item.key}
                        onPress={() => {
                          setWizardFeedback(null);
                          setProfileForm((current) => ({ ...current, genderIdentity: item.key }));
                        }}
                      />
                    ))}
                  </View>

                  <Text style={[styles.inlineFieldLabel, styles.inlineFieldLabelSpaced]}>Que estas buscando</Text>
                  <View style={styles.chipGrid}>
                    {genderIdentityOptions.map((item) => (
                      <ChoiceChip
                        key={`seek-${item.key}`}
                        tone="dark"
                        label={item.label}
                        selected={profileForm.seeking.includes(item.key)}
                        onPress={() => {
                          setWizardFeedback(null);
                          setProfileForm((current) => ({
                            ...current,
                            seeking: toggleSelection(current.seeking, item.key, genderIdentityOptions.length) as GenderIdentity[],
                          }));
                        }}
                      />
                    ))}
                  </View>
                </SectionCard>
              </>
            ) : null}

            {activeStep === "tastes" ? (
              <>
                <SectionCard tone="dark" title="Tus gustos" caption="Con uno basta para empezar. Elige lo que de verdad te representa.">
                  <View style={styles.chipGrid}>
                    {interestOptions.map((interest) => (
                      <ChoiceChip
                        key={interest}
                        tone="dark"
                        label={interest}
                        selected={profileForm.interests.includes(interest)}
                        onPress={() =>
                          {
                            setWizardFeedback(null);
                            setProfileForm((current) => ({
                              ...current,
                              interests: toggleSelection(current.interests, interest, 6),
                            }));
                          }
                        }
                      />
                    ))}
                  </View>
                </SectionCard>

                <SectionCard tone="dark" title="Tu energia" caption="Unas pocas pistas para que el match tenga contexto.">
                  <View style={styles.chipGrid}>
                    {lifestyleOptions.map((item) => (
                      <ChoiceChip
                        key={item}
                        tone="dark"
                        label={item}
                        selected={profileForm.lifestyle.includes(item)}
                        onPress={() =>
                          {
                            setWizardFeedback(null);
                            setProfileForm((current) => ({
                              ...current,
                              lifestyle: toggleSelection(current.lifestyle, item, 3),
                            }));
                          }
                        }
                      />
                    ))}
                  </View>
                </SectionCard>

                <SectionCard tone="dark" title="Una linea tuya" caption="Opcional. Si quieres, deja una frase breve que abra la conversacion.">
                  <InputField
                    tone="dark"
                    label="Plan ideal"
                    value={profileForm.prompt}
                    onChangeText={(value) => {
                      setWizardFeedback(null);
                      setProfileForm((current) => ({ ...current, prompt: value }));
                    }}
                    placeholder="Cafe, paseo y una charla sin prisa."
                    multiline
                  />
                </SectionCard>
              </>
            ) : null}

            {activeStep === "photos" ? (
              <SectionCard tone="dark" title="Tu muro" caption="Empieza con tu foto principal y una mas. Al guardar pasas directo a verificacion.">
                <View style={styles.photoGrid}>
                  {fillPhotoSlots(profileForm.photos).map((photo, index) => (
                    <Pressable
                      key={index}
                      onPress={() => void pickPhoto(index)}
                      style={[styles.photoSlot, styles.photoSlotDark, index === 0 ? styles.photoSlotHero : null]}
                    >
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.photoImage} />
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <Text style={[styles.photoPlaceholderTitle, styles.photoPlaceholderTitleDark]}>
                            {index === 0 ? "Foto principal" : `Muro ${index}`}
                          </Text>
                          <Text style={[styles.photoPlaceholderCopy, styles.photoPlaceholderCopyDark]}>Toca para elegir</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              </SectionCard>
            ) : null}

            <View style={styles.wizardFooterRow}>
              <Pressable onPress={goBackWizard} style={({ pressed }) => [styles.wizardGhostAction, pressed ? styles.welcomeButtonPressed : null]}>
                <Text style={styles.wizardGhostActionText}>{wizardIndex === 0 ? "Cancelar" : "Atras"}</Text>
              </Pressable>

              <Pressable
                onPress={continueWizard}
                disabled={busyKey === "wizard"}
                style={({ pressed }) => [styles.wizardPrimaryActionWrap, pressed ? styles.welcomeButtonPressed : null, busyKey === "wizard" ? styles.buttonDisabled : null]}
              >
                <LinearGradient
                  colors={["#ff5aa0", "#ff2f86", "#ec006b"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.wizardPrimaryAction}
                >
                  <Text style={styles.wizardPrimaryActionText}>
                    {wizardIndex < wizardSteps.length - 1
                      ? "Continuar"
                      : busyKey === "wizard"
                        ? "Guardando..."
                        : isRegister
                          ? "Crear cuenta"
                          : "Guardar perfil"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderVerification() {
    const cameraBlocked = Boolean(cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain === false);
    const verificationStateCopy = verificationPhotoUri
      ? "Selfie lista para confirmar."
      : showCamera
        ? "Camara abierta. Toma tu selfie."
        : cameraBlocked
          ? "Permiso bloqueado. Necesitas activarlo para seguir."
          : "Falta tu selfie para activar la cuenta.";

    return (
      <View style={styles.wizardStage}>
        <OnboardingBackdrop />

        <ScrollView contentContainerStyle={styles.wizardScrollContent}>
          <View style={styles.wizardTopBar}>
            <Pressable onPress={openProfileCompletion} style={styles.wizardBackButton}>
              <Text style={styles.wizardBackText}>Editar perfil</Text>
            </Pressable>
          </View>

          <View style={styles.wizardHeroCardDark}>
            <Text style={styles.wizardHeroKickerDark}>Verificacion</Text>
            <Text style={styles.wizardHeroTitleDark}>Activa tu cuenta</Text>
            <Text style={styles.wizardHeroCopyDark}>
              Una selfie rapida y quedas listo para Match, Chat y Actividad.
            </Text>
          </View>

          <View style={styles.verificationInfoCard}>
            <View style={styles.verificationInfoRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#ff9dc4" />
              <Text style={styles.verificationInfoText}>{verificationStateCopy}</Text>
            </View>
            <Text style={styles.verificationInfoHint}>Tu perfil no puede usar la app hasta terminar esta verificacion.</Text>
          </View>

          {verificationFeedback ? (
            <View style={styles.wizardFeedbackCard}>
              <Text style={styles.wizardFeedbackText}>{verificationFeedback}</Text>
            </View>
          ) : null}

          <SectionCard tone="dark" title="Selfie de verificacion" caption="Hazla una vez y sigues directo a la experiencia completa.">
            {verificationPhotoUri ? (
              <View style={styles.verificationPreviewWrap}>
                <Image source={{ uri: verificationPhotoUri }} style={styles.verificationPreview} />
                <View style={styles.wizardFooterColumn}>
                  <Pressable
                    onPress={() => {
                      setVerificationFeedback(null);
                      setVerificationPhotoUri("");
                    }}
                    style={({ pressed }) => [styles.wizardGhostAction, pressed ? styles.welcomeButtonPressed : null]}
                  >
                    <Text style={styles.wizardGhostActionText}>Tomar otra</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void confirmVerification()}
                    disabled={busyKey === "verify"}
                    style={({ pressed }) => [styles.wizardPrimaryActionWrap, pressed ? styles.welcomeButtonPressed : null, busyKey === "verify" ? styles.buttonDisabled : null]}
                  >
                    <LinearGradient
                      colors={["#ff5aa0", "#ff2f86", "#ec006b"]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.wizardPrimaryAction}
                    >
                      <Text style={styles.wizardPrimaryActionText}>{busyKey === "verify" ? "Verificando..." : "Confirmar selfie"}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : showCamera ? (
              <View style={styles.cameraStage}>
                <CameraView ref={cameraRef} style={styles.cameraView} facing="front" />
                <View style={styles.wizardFooterColumn}>
                  <Pressable onPress={() => setShowCamera(false)} style={({ pressed }) => [styles.wizardGhostAction, pressed ? styles.welcomeButtonPressed : null]}>
                    <Text style={styles.wizardGhostActionText}>Cerrar camara</Text>
                  </Pressable>
                  <Pressable onPress={() => void captureVerificationSelfie()} style={({ pressed }) => [styles.wizardPrimaryActionWrap, pressed ? styles.welcomeButtonPressed : null]}>
                    <LinearGradient
                      colors={["#ff5aa0", "#ff2f86", "#ec006b"]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.wizardPrimaryAction}
                    >
                      <Text style={styles.wizardPrimaryActionText}>Tomar selfie</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.wizardFooterColumn}>
                <Pressable
                  onPress={() => void openCameraForVerification()}
                  style={({ pressed }) => [styles.wizardPrimaryActionWrap, pressed ? styles.welcomeButtonPressed : null]}
                >
                  <LinearGradient
                    colors={["#ff5aa0", "#ff2f86", "#ec006b"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.wizardPrimaryAction}
                  >
                    <Text style={styles.wizardPrimaryActionText}>Abrir camara</Text>
                  </LinearGradient>
                </Pressable>
                {cameraBlocked ? (
                  <Pressable onPress={() => void openCameraSettings()} style={({ pressed }) => [styles.wizardGhostAction, pressed ? styles.welcomeButtonPressed : null]}>
                    <Text style={styles.wizardGhostActionText}>Abrir ajustes</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => void pickVerificationSelfieFromLibrary()} style={({ pressed }) => [styles.secondaryWideButton, pressed ? styles.welcomeButtonPressed : null]}>
                  <Text style={styles.secondaryWideButtonText}>Usar selfie ya tomada</Text>
                </Pressable>
                <Pressable onPress={openProfileCompletion} style={({ pressed }) => [styles.wizardGhostAction, pressed ? styles.welcomeButtonPressed : null]}>
                  <Text style={styles.wizardGhostActionText}>Editar perfil antes</Text>
                </Pressable>
              </View>
            )}
          </SectionCard>
        </ScrollView>
      </View>
    );
  }

  function renderMatchTab() {
    const likesCopy =
      discover?.likesRemaining === null
        ? "Conexiones sin limite"
        : `${discover?.likesRemaining ?? launchConfig.freePlan.dailyLikeLimit} likes disponibles`;
    const directMessageCopy =
      discover?.directMessagesRemaining === null
        ? "mensajes directos sin limite"
        : `${discover?.directMessagesRemaining ?? launchConfig.freePlan.dailyDirectMessageLimit} mensajes directos`;

    if (!currentProfile) {
      return (
        <ScrollView contentContainerStyle={styles.appScroll}>
          <View style={styles.screenHeaderRow}>
            <View>
              <Text style={styles.screenEyebrow}>Match</Text>
              <Text style={styles.screenTitle}>Tu siguiente conexion no entro todavia.</Text>
            </View>
            <Pressable onPress={openFilters} style={styles.screenIconButton}>
              <Ionicons name="options-outline" size={20} color="#ffd7e6" />
            </Pressable>
          </View>

          <View style={styles.emptyGlassCard}>
            <Text style={styles.emptyGlassTitle}>{activeFilterCount > 0 ? "No hay perfiles que encajen con tus filtros." : "Sin perfiles nuevos por ahora."}</Text>
            <Text style={styles.emptyGlassCopy}>
              {activeFilterCount > 0
                ? "Prueba ampliar la edad, bajar la exigencia o quitar filtros para volver a ver candidatos."
                : "Cuando entren personas compatibles, apareceran aqui con el mismo formato de swipe."}
            </Text>
            <View style={styles.inlineActionRow}>
              {activeFilterCount > 0 ? (
                <Pressable
                  onPress={clearAppliedFilters}
                  style={({ pressed }) => [styles.secondaryOutlineButton, pressed ? styles.welcomeButtonPressed : null]}
                >
                  <Text style={styles.secondaryOutlineButtonText}>Quitar filtros</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setTab("activity")} style={({ pressed }) => [styles.primaryMiniButton, pressed ? styles.welcomeButtonPressed : null]}>
                <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryMiniButtonFill}>
                  <Text style={styles.primaryMiniButtonText}>Ir a actividad</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      );
    }

    const galleryPhotos = currentProfilePhotos.length > 0 ? currentProfilePhotos : [activeMatchPhoto];
    const seekingCopy =
      currentProfile.seeking.length > 0 ? currentProfile.seeking.map(genderIdentityLabel).join(", ") : "sin definir";

    return (
      <View style={styles.matchStage}>
      <ScrollView contentContainerStyle={[styles.appScroll, styles.matchScrollContent]}>
        <View style={styles.screenHeaderRow}>
          <View style={styles.screenHeaderCopy}>
            <Text style={styles.screenEyebrow}>Match</Text>
            <Text style={styles.screenTitle}>Descubre personas que resuenen contigo.</Text>
            <Text style={styles.screenSubtleText}>
              {likesCopy}  |  {directMessageCopy}
              {filteredProfiles.length ? `  |  ${filteredProfiles.length} visibles` : ""}
            </Text>
          </View>
          <Pressable onPress={openFilters} style={styles.screenIconButton}>
            <Ionicons name="options-outline" size={20} color="#ffd7e6" />
          </Pressable>
        </View>

        {activeFilterCount > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilterStrip}>
            <View style={styles.activeFilterPill}>
              <Text style={styles.activeFilterPillText}>{matchFilters.radiusKm} km</Text>
            </View>
            <View style={styles.activeFilterPill}>
              <Text style={styles.activeFilterPillText}>{matchFilters.minAge}-{matchFilters.maxAge} anos</Text>
            </View>
            {matchFilters.verifiedOnly ? (
              <View style={styles.activeFilterPill}>
                <Text style={styles.activeFilterPillText}>Verificadas</Text>
              </View>
            ) : null}
            {matchFilters.highConnectionOnly ? (
              <View style={styles.activeFilterPill}>
                <Text style={styles.activeFilterPillText}>Conexion alta</Text>
              </View>
            ) : null}
            {matchFilters.interests.map((interest) => (
              <View key={interest} style={styles.activeFilterPill}>
                <Text style={styles.activeFilterPillText}>{interest}</Text>
              </View>
            ))}
            <Pressable onPress={clearAppliedFilters} style={styles.activeFilterClearPill}>
              <Text style={styles.activeFilterClearText}>Limpiar</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        <View style={styles.matchMetricRow}>
          <View style={styles.matchMetricPill}>
            <Ionicons name="heart" size={13} color="#ff5ca2" />
            <Text style={styles.matchMetricValue}>{currentProfile.compatibilityScore}%</Text>
            <Text style={styles.matchMetricLabel}>compatibilidad</Text>
          </View>
          <View style={styles.matchMetricPill}>
            <Ionicons name="location-outline" size={13} color="#ffd7e6" />
            <Text style={styles.matchMetricValue}>{matchFilters.radiusKm} km</Text>
            <Text style={styles.matchMetricLabel}>de distancia</Text>
          </View>
          <View style={styles.matchMetricPill}>
            <Ionicons name="shield-checkmark-outline" size={13} color={currentProfile.isVerified ? "#8bffb2" : "#ffd7e6"} />
            <Text style={styles.matchMetricValue}>{currentProfile.isVerified ? "alta" : "media"}</Text>
            <Text style={styles.matchMetricLabel}>conexion</Text>
          </View>
        </View>

        <Animated.View
          style={[
            styles.matchCardWrap,
            {
              transform: [
                { translateX: matchSwipe.x },
                { translateY: matchSwipe.y },
                { rotate: matchSwipeRotation },
              ],
            },
          ]}
          {...matchPanResponder.panHandlers}
        >
        <View style={styles.matchCard}>
          <Pressable onPress={() => openMatchPhotoViewer(matchPhotoIndex)} style={styles.matchCardPhotoButton}>
            <Image
              source={{
                uri: activeMatchPhoto,
              }}
              style={styles.matchCardImage}
            />
          </Pressable>
          <LinearGradient colors={["rgba(4,2,9,0.08)", "rgba(6,3,11,0.18)", "rgba(4,2,9,0.94)"]} style={styles.matchCardShade} />

          <View style={styles.matchCardTop}>
            <View style={styles.matchCardTopLeft}>
              <View style={styles.smallStatusBadge}>
                <View style={[styles.liveDot, currentProfile.isVerified ? styles.liveDotActive : null]} />
                <Text style={styles.smallStatusBadgeText}>{currentProfile.isVerified ? "En linea" : "Activa hoy"}</Text>
              </View>
              <View style={styles.smallStatusBadge}>
                <Ionicons name="shield-checkmark-outline" size={11} color="#9cffbe" />
                <Text style={styles.smallStatusBadgeText}>{currentProfile.isVerified ? "Verificada" : "Pendiente"}</Text>
              </View>
              {currentProfileMatch ? (
                <View style={styles.smallStatusBadge}>
                  <Ionicons name="chatbubble-ellipses-outline" size={11} color="#ffd7e6" />
                  <Text style={styles.smallStatusBadgeText}>Ya hicieron match</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.matchCardTopRight}>
              <Pressable onPress={() => openMatchPhotoViewer(matchPhotoIndex)} style={styles.matchCardMiniAction}>
                <Ionicons name="images-outline" size={16} color="#fff5fa" />
              </Pressable>
              <Pressable onPress={() => void handleReport(currentProfile)} style={styles.matchCardMiniAction}>
                <Ionicons name="flag-outline" size={16} color="#fff5fa" />
              </Pressable>
            </View>
          </View>

          <Animated.View style={[styles.matchSwipeBadge, styles.matchSwipeBadgeLike, { opacity: matchSwipeLikeOpacity }]}>
            <Text style={styles.matchSwipeBadgeText}>LIKE</Text>
          </Animated.View>
          <Animated.View style={[styles.matchSwipeBadge, styles.matchSwipeBadgePass, { opacity: matchSwipePassOpacity }]}>
            <Text style={styles.matchSwipeBadgeText}>NOPE</Text>
          </Animated.View>

          <View style={styles.matchCardBottom}>
            <Text style={styles.matchCardName}>
              {currentProfile.displayName}, {currentProfile.age}
            </Text>
            <Text style={styles.matchCardMeta}>
              {currentProfile.city}  |  {currentProfile.zodiacSign || "sin signo"}
            </Text>
            <Text style={styles.matchCardMetaSubtle}>
              {genderIdentityLabel(currentProfile.genderIdentity)}  |  Busca: {seekingCopy}
            </Text>
            <Text style={styles.matchCardBio}>{currentProfile.bio}</Text>

            <View style={styles.matchCardReasonRow}>
              {currentProfile.compatibilityReasons.slice(0, 3).map((reason) => (
                <View key={reason} style={styles.matchReasonPill}>
                  <Text style={styles.matchReasonPillText}>{reason}</Text>
                </View>
              ))}
            </View>

            <View style={styles.matchInterestRow}>
              {currentProfile.interests.slice(0, 5).map((interest) => (
                <View key={interest} style={styles.matchInterestChip}>
                  <Text style={styles.matchInterestChipText}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>

        </View>
        </Animated.View>

        <View style={styles.matchUtilityRow}>
          <Pressable onPress={() => openMatchPhotoViewer(matchPhotoIndex)} style={({ pressed }) => [styles.matchUtilityButton, pressed ? styles.welcomeButtonPressed : null]}>
            <View style={styles.matchUtilityIcon}>
              <Ionicons name="images-outline" size={18} color="#ffdcef" />
            </View>
            <View style={styles.matchUtilityCopy}>
              <Text style={styles.matchUtilityTitle}>Mirar fotos</Text>
              <Text style={styles.matchUtilityCaption}>{galleryPhotos.length} fotos en su perfil</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => void handleBlock(currentProfile)} style={({ pressed }) => [styles.matchUtilityButton, styles.matchUtilityButtonMuted, pressed ? styles.welcomeButtonPressed : null]}>
            <View style={styles.matchUtilityIcon}>
              <Ionicons name="ban-outline" size={18} color="#ffdcef" />
            </View>
            <View style={styles.matchUtilityCopy}>
              <Text style={styles.matchUtilityTitle}>Bloquear</Text>
              <Text style={styles.matchUtilityCaption}>Ocultarlo por completo</Text>
            </View>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryStripScroll}>
          {galleryPhotos.map((photo, index) => (
            <Pressable
              key={`${photo}-${index}`}
              onPress={() => setMatchPhotoIndex(index)}
              onLongPress={() => openMatchPhotoViewer(index)}
              style={[styles.galleryStripThumb, index === matchPhotoIndex ? styles.galleryStripThumbActive : null]}
            >
              <Image source={{ uri: photo }} style={styles.galleryStripThumbImage} />
              <View style={styles.galleryStripBadge}>
                <Text style={styles.galleryStripBadgeText}>{index === 0 ? "Principal" : `Foto ${index + 1}`}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.infoGlassCard}>
          <Text style={styles.infoGlassTitle}>Un vistazo rapido</Text>
          <Text style={styles.infoGlassCopy}>{currentProfile.prompts[0] ?? "Busca una conexion seria con buena conversacion y energia tranquila."}</Text>
        </View>

        <View style={styles.feedPanel}>
          <View style={styles.feedPanelHeader}>
            <View style={styles.feedPanelCopy}>
              <Text style={styles.feedPanelTitle}>Perfil completo</Text>
              <Text style={styles.feedPanelCaption}>Todo lo importante antes de decidir si conectar o no.</Text>
            </View>
            <Text style={styles.feedPanelCount}>{currentProfileMatch ? "match" : currentProfile.isVerified ? "ok" : "nuevo"}</Text>
          </View>

          <View style={styles.matchProfileFactGrid}>
            <View style={styles.matchProfileFactCard}>
              <Text style={styles.matchProfileFactLabel}>Identidad</Text>
              <Text style={styles.matchProfileFactValue}>{genderIdentityLabel(currentProfile.genderIdentity)}</Text>
            </View>
            <View style={styles.matchProfileFactCard}>
              <Text style={styles.matchProfileFactLabel}>Busca</Text>
              <Text style={styles.matchProfileFactValue}>{seekingCopy}</Text>
            </View>
            <View style={styles.matchProfileFactCard}>
              <Text style={styles.matchProfileFactLabel}>Intencion</Text>
              <Text style={styles.matchProfileFactValue}>
                {currentProfile.intention === "relacion-seria" ? "Relacion seria" : currentProfile.intention}
              </Text>
            </View>
            <View style={styles.matchProfileFactCard}>
              <Text style={styles.matchProfileFactLabel}>Ciudad</Text>
              <Text style={styles.matchProfileFactValue}>{currentProfile.city}</Text>
            </View>
          </View>

          <Text style={styles.matchSectionTitle}>Bio</Text>
          <Text style={styles.infoGlassCopy}>{currentProfile.bio}</Text>

          <Text style={styles.matchSectionTitle}>Intereses</Text>
          <View style={styles.profileDarkChipRow}>
            {currentProfile.interests.map((interest) => (
              <View key={interest} style={styles.profileDarkChip}>
                <Text style={styles.profileDarkChipText}>{interest}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.matchSectionTitle}>Estilo de vida</Text>
          <View style={styles.profileDarkChipRow}>
            {(currentProfile.lifestyle.length > 0 ? currentProfile.lifestyle : ["Sin definir"]).map((item) => (
              <View key={item} style={styles.profileDarkChip}>
                <Text style={styles.profileDarkChipText}>{item}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.matchSectionTitle}>Por que podria funcionar</Text>
          <View style={styles.matchDetailReasonList}>
            {currentProfile.compatibilityReasons.length > 0 ? (
              currentProfile.compatibilityReasons.map((reason) => (
                <View key={reason} style={styles.matchDetailReasonRow}>
                  <Ionicons name="sparkles-outline" size={15} color="#ff7cb6" />
                  <Text style={styles.matchDetailReasonText}>{reason}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.infoGlassCopy}>Todavia no hay motivos destacados, pero puedes explorar el perfil con calma.</Text>
            )}
          </View>
        </View>

        <View style={styles.inlineActionRow}>
          <Pressable onPress={() => void handleReport(currentProfile)} style={({ pressed }) => [styles.secondaryOutlineButton, pressed ? styles.welcomeButtonPressed : null]}>
            <Text style={styles.secondaryOutlineButtonText}>Reportar perfil</Text>
          </Pressable>
        </View>

        <Text style={styles.matchFooterCopy}>
          {busyKey === "like"
            ? "Enviando interes..."
            : busyKey === "pass"
              ? "Guardando decision..."
              : busyKey === "direct-message"
                ? "Enviando mensaje inicial..."
              : busyKey === "report"
                ? "Enviando reporte..."
                : busyKey === "block"
                  ? "Bloqueando perfil..."
                  : currentProfileMatch
                    ? "Ya tienes match con esta persona. Puedes ir al chat cuando quieras."
                    : "Todas las acciones base siguen disponibles en free. Solo limitamos el volumen, no la experiencia."}
        </Text>
      </ScrollView>

      <View style={styles.matchActionDock}>
        <Text style={styles.matchPrimaryActionHint}>
          {!currentProfileMatch
            ? "Desliza a la izquierda para pasar, a la derecha para aceptar o usa Mensaje para romper el hielo."
            : "Desliza a la izquierda para rechazar o a la derecha para aceptar."}
        </Text>
        <View style={styles.matchPrimaryActionRow}>
          <Pressable
            hitSlop={8}
            onPress={() => animateMatchDecision("pass")}
            style={({ pressed }) => [styles.matchPrimaryActionButton, pressed ? styles.welcomeButtonPressed : null]}
          >
            <Ionicons name="close-outline" size={30} color="#ffd8e7" />
            <Text style={styles.matchPrimaryActionText}>Pasar</Text>
          </Pressable>

          {!currentProfileMatch ? (
            <Pressable
              hitSlop={8}
              onPress={() => openDirectMessageComposer(currentProfile)}
              style={({ pressed }) => [styles.matchPrimaryActionButton, styles.matchPrimaryActionButtonSecondary, pressed ? styles.welcomeButtonPressed : null]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#ffd8e7" />
              <Text style={styles.matchPrimaryActionText}>Mensaje</Text>
            </Pressable>
          ) : null}

          <Pressable
            hitSlop={8}
            onPress={() => animateMatchDecision("like")}
            style={({ pressed }) => [styles.matchPrimaryActionButtonWrap, pressed ? styles.welcomeButtonPressed : null]}
          >
            <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.matchPrimaryActionButtonPrimary}>
              <Ionicons name="heart" size={30} color="#fff6fb" />
              <Text style={styles.matchPrimaryActionTextPrimary}>Gustar</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      </View>
    );
  }

  function renderMatchPhotoViewerOverlay() {
    if (!currentProfile) {
      return null;
    }

    const galleryPhotos = currentProfilePhotos.length > 0 ? currentProfilePhotos : [activeMatchPhoto];
    const safePhoto = galleryPhotos[matchPhotoIndex] ?? galleryPhotos[0];

    return (
      <View style={styles.filterOverlay}>
        <Pressable style={styles.filterOverlayBackdrop} onPress={closeMatchPhotoViewer} />
        <View style={styles.matchPhotoViewerCard}>
          <Image source={{ uri: safePhoto }} style={styles.matchPhotoViewerImage} />
          <LinearGradient colors={["rgba(3,2,8,0.08)", "rgba(3,2,8,0.18)", "rgba(3,2,8,0.88)"]} style={styles.matchPhotoViewerShade} />

          <View style={styles.matchPhotoViewerHeader}>
            <View style={styles.matchPhotoViewerCopy}>
              <Text style={styles.matchPhotoViewerTitle}>
                {currentProfile.displayName}, {currentProfile.age}
              </Text>
              <Text style={styles.matchPhotoViewerMeta}>
                {matchPhotoIndex + 1} / {galleryPhotos.length}  |  {currentProfile.city}
              </Text>
            </View>
            <Pressable onPress={closeMatchPhotoViewer} style={styles.matchPhotoViewerCloseButton}>
              <Ionicons name="close-outline" size={24} color="#fff7fb" />
            </Pressable>
          </View>

          {galleryPhotos.length > 1 ? (
            <View style={styles.matchPhotoViewerNav}>
              <Pressable onPress={() => moveMatchPhoto(-1)} style={styles.matchPhotoViewerNavButton}>
                <Ionicons name="chevron-back-outline" size={22} color="#fff7fb" />
              </Pressable>
              <Pressable onPress={() => moveMatchPhoto(1)} style={styles.matchPhotoViewerNavButton}>
                <Ionicons name="chevron-forward-outline" size={22} color="#fff7fb" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  function renderDirectMessageComposerOverlay() {
    if (!currentProfile) {
      return null;
    }

    const remainingCopy =
      discover?.directMessagesRemaining === null
        ? "sin limite hoy"
        : `${discover?.directMessagesRemaining ?? launchConfig.freePlan.dailyDirectMessageLimit} gratis hoy`;
    const canSend = directMessageDraft.trim().length >= 6 && busyKey !== "direct-message";

    return (
      <View style={styles.filterOverlay}>
        <Pressable style={styles.filterOverlayBackdrop} onPress={closeDirectMessageComposer} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <View style={styles.directMessageSheet}>
            <View style={styles.filterSheetHeader}>
              <View style={styles.directMessageHeaderCopy}>
                <Text style={styles.filterSheetTitle}>Mensaje inicial</Text>
                <Text style={styles.directMessageMeta}>
                  {currentProfile.displayName} · {remainingCopy}
                </Text>
              </View>
              <Pressable onPress={closeDirectMessageComposer} style={styles.filterCloseButton}>
                <Ionicons name="close-outline" size={22} color="#fff5fa" />
              </Pressable>
            </View>

            <View style={styles.directMessageProfileRow}>
              <Image source={{ uri: currentProfile.photos[0] ?? activeMatchPhoto }} style={styles.directMessageAvatar} />
              <View style={styles.directMessageProfileCopy}>
                <Text style={styles.directMessageProfileName}>
                  {currentProfile.displayName}, {currentProfile.age}
                </Text>
                <Text style={styles.directMessageProfileMeta}>
                  {currentProfile.city} · {genderIdentityLabel(currentProfile.genderIdentity)}
                </Text>
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabelDark}>Que quieres decirle</Text>
              <TextInput
                value={directMessageDraft}
                onChangeText={setDirectMessageDraft}
                placeholder="Escribe un saludo natural y directo"
                placeholderTextColor="rgba(255,255,255,0.42)"
                selectionColor="#ff5ba1"
                multiline
                maxLength={240}
                autoCapitalize="sentences"
                textAlignVertical="top"
                style={[styles.input, styles.inputDark, styles.directMessageInput]}
              />
            </View>

            <Text style={styles.directMessageHelper}>
              Minimo 6 caracteres. Este mensaje se envía antes del match y cuenta dentro de tus mensajes gratis del día.
            </Text>

            <View style={styles.directMessageActions}>
              <Pressable
                onPress={closeDirectMessageComposer}
                disabled={busyKey === "direct-message"}
                style={({ pressed }) => [styles.secondaryOutlineButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Text style={styles.secondaryOutlineButtonText}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleDirectMessage(currentProfile, directMessageDraft)}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.primaryMiniButton,
                  !canSend ? styles.buttonDisabled : null,
                  pressed && canSend ? styles.welcomeButtonPressed : null,
                ]}
              >
                <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryMiniButtonFill}>
                  <Text style={styles.primaryMiniButtonText}>{busyKey === "direct-message" ? "Enviando..." : "Enviar"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderProfileReportOverlay() {
    if (!reportTargetProfile) {
      return null;
    }

    const canSubmitReport = busyKey !== "report";

    return (
      <View style={styles.filterOverlay}>
        <Pressable style={styles.filterOverlayBackdrop} onPress={() => closeReportComposer()} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <View style={styles.directMessageSheet}>
            <View style={styles.filterSheetHeader}>
              <View style={styles.directMessageHeaderCopy}>
                <Text style={styles.filterSheetTitle}>Reportar perfil</Text>
                <Text style={styles.directMessageMeta}>Cuentanos que paso con {reportTargetProfile.displayName}.</Text>
              </View>
              <Pressable onPress={() => closeReportComposer()} style={styles.filterCloseButton}>
                <Ionicons name="close-outline" size={22} color="#fff5fa" />
              </Pressable>
            </View>

            <View style={styles.directMessageProfileRow}>
              <Image source={{ uri: reportTargetProfile.photos[0] ?? activeMatchPhoto }} style={styles.directMessageAvatar} />
              <View style={styles.directMessageProfileCopy}>
                <Text style={styles.directMessageProfileName}>
                  {reportTargetProfile.displayName}, {reportTargetProfile.age}
                </Text>
                <Text style={styles.directMessageProfileMeta}>
                  {reportTargetProfile.city} · {genderIdentityLabel(reportTargetProfile.genderIdentity)}
                </Text>
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabelDark}>Motivo</Text>
              <View style={styles.chipGrid}>
                {profileReportOptions.map((option) => (
                  <ChoiceChip
                    key={option.key}
                    tone="dark"
                    label={option.label}
                    selected={reportReason === option.key}
                    onPress={() => setReportReason(option.key)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabelDark}>Detalles opcionales</Text>
              <TextInput
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder="Si quieres, deja una nota breve para revisar mejor el caso."
                placeholderTextColor="rgba(255,255,255,0.42)"
                selectionColor="#ff5ba1"
                multiline
                maxLength={240}
                autoCapitalize="sentences"
                textAlignVertical="top"
                style={[styles.input, styles.inputDark, styles.directMessageInput]}
              />
            </View>

            <Text style={styles.directMessageHelper}>
              El reporte no avisa a la otra persona. Lo usamos para revision manual y decisiones de moderacion.
            </Text>

            <View style={styles.directMessageActions}>
              <Pressable
                onPress={() => closeReportComposer()}
                disabled={!canSubmitReport}
                style={({ pressed }) => [styles.secondaryOutlineButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Text style={styles.secondaryOutlineButtonText}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={() => void submitProfileReport()}
                disabled={!canSubmitReport}
                style={({ pressed }) => [
                  styles.primaryMiniButton,
                  !canSubmitReport ? styles.buttonDisabled : null,
                  pressed && canSubmitReport ? styles.welcomeButtonPressed : null,
                ]}
              >
                <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryMiniButtonFill}>
                  <Text style={styles.primaryMiniButtonText}>{busyKey === "report" ? "Enviando..." : "Enviar reporte"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderChatTab() {
    const totalUnreadThreads = Array.from(unreadChatByMatchId.values()).reduce((sum, value) => sum + value, 0);
    const selectedThreadUnread = selectedMatch ? unreadChatByMatchId.get(selectedMatch.id) ?? 0 : 0;
    const selectedPrompt =
      selectedMatch?.otherUser.prompts[0] ?? "Haz la conversacion simple, honesta y con energia real desde el primer mensaje.";
    const canSendMessage = composer.trim().length > 0 && !String(busyKey ?? "").startsWith("message");

    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        {!selectedMatch ? (
          <ScrollView contentContainerStyle={styles.appScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.screenHeaderRow}>
              <View style={styles.screenHeaderCopy}>
                <Text style={styles.screenEyebrow}>Mensajes</Text>
                <Text style={styles.screenTitle}>Habla directo, como una mensajeria real.</Text>
                <Text style={styles.screenSubtleText}>
                  {filteredMatches.length} conversaciones  |  {totalUnreadThreads} por leer
                </Text>
              </View>
              <View style={styles.screenIconButton}>
                <Ionicons name="notifications-outline" size={20} color="#ffd7e6" />
                {totalUnreadThreads > 0 ? (
                  <View style={styles.chatHeaderBadge}>
                    <Text style={styles.chatHeaderBadgeText}>{totalUnreadThreads > 9 ? "9+" : totalUnreadThreads}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.searchGlassBar}>
              <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.6)" />
              <TextInput
                value={chatSearch}
                onChangeText={setChatSearch}
                placeholder="Busca por nombre o ciudad"
                placeholderTextColor="rgba(255,255,255,0.4)"
                selectionColor="#ff5ba1"
                style={styles.searchGlassInput}
              />
            </View>

            {filteredMatches.length === 0 ? (
              <View style={styles.emptyGlassCard}>
                <Text style={styles.emptyGlassTitle}>Todavia no tienes chats activos.</Text>
                <Text style={styles.emptyGlassCopy}>
                  Cuando hagas match mutuo, la conversacion aparece aqui y la abres tocando a la persona.
                </Text>
              </View>
            ) : (
              <View style={styles.chatMessengerList}>
                {filteredMatches.map((item) => {
                  const unreadCount = unreadChatByMatchId.get(item.id) ?? 0;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => void openMatchThread(item.id)}
                      style={({ pressed }) => [styles.chatMessengerRow, pressed ? styles.welcomeButtonPressed : null]}
                    >
                      <View style={styles.chatMessengerAvatarWrap}>
                        <Image source={{ uri: item.otherUser.photos[0] }} style={styles.chatMessengerAvatar} />
                        {unreadCount > 0 ? <View style={styles.chatMessengerLiveDot} /> : null}
                      </View>

                      <View style={styles.chatMessengerCopy}>
                        <View style={styles.chatMessengerTitleRow}>
                          <Text style={styles.chatMessengerName}>
                            {item.otherUser.displayName}, {item.otherUser.age}
                          </Text>
                          <Text style={[styles.chatMessengerTime, unreadCount > 0 ? styles.chatMessengerTimeUnread : null]}>
                            {formatMoment(item.lastMessageAt ?? item.createdAt)}
                          </Text>
                        </View>

                        <View style={styles.chatMessengerSnippetRow}>
                          <Text
                            style={[styles.chatMessengerSnippet, unreadCount > 0 ? styles.chatMessengerSnippetUnread : null]}
                            numberOfLines={1}
                          >
                            {item.lastMessage ?? "El match ya esta hecho. Toca para abrir el chat."}
                          </Text>
                          {unreadCount > 0 ? (
                            <View style={styles.chatMessengerUnreadBadge}>
                              <Text style={styles.chatMessengerUnreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.chatMessengerMetaRow}>
                          <Text style={styles.chatMessengerMeta}>{item.otherUser.city}</Text>
                          <Text style={styles.chatMessengerMeta}>{item.otherUser.compatibilityScore}% afinidad</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.chatThreadStage}>
            <View style={styles.chatThreadHeader}>
              <Pressable onPress={() => setSelectedMatchId(null)} style={({ pressed }) => [styles.chatBackButton, pressed ? styles.welcomeButtonPressed : null]}>
                <Ionicons name="chevron-back" size={20} color="#fff7fb" />
              </Pressable>

              <View style={styles.chatThreadIdentity}>
                <Image source={{ uri: selectedMatch.otherUser.photos[0] }} style={styles.chatThreadAvatar} />
                <View style={styles.chatThreadIdentityCopy}>
                  <Text style={styles.chatThreadName}>
                    {selectedMatch.otherUser.displayName}, {selectedMatch.otherUser.age}
                  </Text>
                  <Text style={styles.chatThreadMeta}>
                    {selectedMatch.otherUser.city} · {selectedMatch.otherUser.isVerified ? "Verificada" : "Activa"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => openDiscoverProfile(selectedMatch.otherUser.userId)}
                style={({ pressed }) => [styles.chatThreadProfileButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Ionicons name="person-circle-outline" size={20} color="#fff4fa" />
              </Pressable>
            </View>

            <View style={styles.chatThreadStatusRow}>
              <Text style={styles.chatThreadStatusText}>{activeMessages.length} mensajes</Text>
              <Text style={styles.chatThreadStatusText}>
                {selectedThreadUnread > 0 ? `${selectedThreadUnread} sin leer` : "Todo al dia"}
              </Text>
            </View>

            <ScrollView
              style={styles.chatThreadMessages}
              contentContainerStyle={styles.chatThreadMessagesContent}
              keyboardShouldPersistTaps="handled"
            >
              {activeMessages.length === 0 ? (
                <View style={styles.threadEmptyState}>
                  <Text style={styles.threadEmptyTitle}>El chat esta listo.</Text>
                  <Text style={styles.threadEmptyCopy}>Envia un mensaje, una foto o una nota de voz y rompe el hielo sin vueltas.</Text>
                </View>
              ) : (
                activeMessages.map((message) => {
                  const mine = message.sender_user_id === session?.user.id;

                  if (message.message_type === "image") {
                    return (
                      <View
                        key={message.id}
                        style={[styles.darkMessageBubble, mine ? styles.darkMessageBubbleMine : styles.darkMessageBubbleTheirs, styles.mediaMessageBubble]}
                      >
                        <Image source={{ uri: message.media_uri }} style={styles.chatImageMessage} />
                        {!mine ? (
                          <Pressable
                            onPress={() => reportPhotoMessage(message)}
                            style={({ pressed }) => [styles.chatMediaReportButton, pressed ? styles.welcomeButtonPressed : null]}
                          >
                            <Ionicons name="flag-outline" size={14} color="#fff5fa" />
                            <Text style={styles.chatMediaReportText}>Reportar foto</Text>
                          </Pressable>
                        ) : null}
                        <Text style={[styles.darkMessageMeta, mine ? styles.darkMessageMetaMine : styles.darkMessageMetaTheirs]}>
                          {formatMoment(message.created_at)}
                        </Text>
                      </View>
                    );
                  }

                  if (message.message_type === "voice") {
                    const isPlaying = playingMessageId === message.id;
                    return (
                      <Pressable
                        key={message.id}
                        onPress={() => void playVoiceMessage(message)}
                        style={[styles.darkMessageBubble, mine ? styles.darkMessageBubbleMine : styles.darkMessageBubbleTheirs, styles.voiceMessageBubble]}
                      >
                        <View style={styles.voiceMessageRow}>
                          <View style={[styles.voiceMessageIconWrap, mine ? styles.voiceMessageIconWrapMine : null]}>
                            <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff8fc" />
                          </View>
                          <View style={styles.voiceMessageCopy}>
                            <Text style={[styles.voiceMessageTitle, mine ? styles.darkMessageTextMine : styles.darkMessageTextTheirs]}>
                              {isPlaying ? "Reproduciendo audio" : "Nota de voz"}
                            </Text>
                            <Text style={[styles.voiceMessageDuration, mine ? styles.darkMessageMetaMine : styles.darkMessageMetaTheirs]}>
                              {formatAudioDuration(message.media_duration_ms)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.darkMessageMeta, mine ? styles.darkMessageMetaMine : styles.darkMessageMetaTheirs]}>
                          {formatMoment(message.created_at)}
                        </Text>
                      </Pressable>
                    );
                  }

                  return (
                    <View key={message.id} style={[styles.darkMessageBubble, mine ? styles.darkMessageBubbleMine : styles.darkMessageBubbleTheirs]}>
                      <Text style={[styles.darkMessageText, mine ? styles.darkMessageTextMine : styles.darkMessageTextTheirs]}>{message.content}</Text>
                      <Text style={[styles.darkMessageMeta, mine ? styles.darkMessageMetaMine : styles.darkMessageMetaTheirs]}>
                        {formatMoment(message.created_at)}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {activeMessages.length === 0 ? (
              <View style={styles.quickStarterSection}>
                <Text style={styles.quickStarterSectionTitle}>Ideas para empezar</Text>
                <View style={styles.quickStarterRow}>
                  {[
                    `Hola ${selectedMatch.otherUser.displayName}, me gusto tu perfil.`,
                    "Tu energia se siente muy natural.",
                    "Si te va, empezamos con una charla simple.",
                  ].map((starter) => (
                    <Pressable key={starter} onPress={() => void sendMessage(starter)} style={styles.quickStarterChip}>
                      <Text style={styles.quickStarterChipText}>{starter}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.chatComposerDock}>
              <Pressable
                onPress={() => void pickChatPhoto()}
                disabled={String(busyKey ?? "").startsWith("message")}
                style={({ pressed }) => [
                  styles.chatComposerAction,
                  String(busyKey ?? "").startsWith("message") ? styles.buttonDisabled : null,
                  pressed ? styles.welcomeButtonPressed : null,
                ]}
              >
                <Ionicons name="image-outline" size={20} color="#ffe7f1" />
              </Pressable>

              <Pressable
                onPress={() => void toggleVoiceRecording()}
                disabled={busyKey === "message" || busyKey === "message-photo"}
                style={({ pressed }) => [
                  styles.chatComposerAction,
                  recordingAudio ? styles.chatComposerActionRecording : null,
                  busyKey === "message" || busyKey === "message-photo" ? styles.buttonDisabled : null,
                  pressed ? styles.welcomeButtonPressed : null,
                ]}
              >
                <Ionicons name={recordingAudio ? "stop-circle-outline" : "mic-outline"} size={20} color="#fff7fb" />
              </Pressable>

              <View style={styles.chatComposerInputWrap}>
                <TextInput
                  value={composer}
                  onChangeText={setComposer}
                  placeholder={recordingAudio ? "Toca stop para enviar el audio" : "Escribe un mensaje"}
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  selectionColor="#ff5ba1"
                  multiline
                  style={styles.chatComposerInput}
                />
              </View>

              <Pressable
                onPress={() => void sendMessage()}
                disabled={!canSendMessage}
                style={({ pressed }) => [
                  styles.chatComposerSendWrap,
                  !canSendMessage ? styles.buttonDisabled : null,
                  pressed && canSendMessage ? styles.welcomeButtonPressed : null,
                ]}
              >
                <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.chatComposerSend}>
                  <Ionicons name="send" size={18} color="#fffdfd" />
                </LinearGradient>
              </Pressable>
            </View>

            <Text style={styles.chatComposerHelperText}>
              {recordingAudio
                ? "Grabando ahora. Toca el boton rojo para enviar la nota de voz."
                : "Puedes mandar texto, fotos y notas de voz. Las fotos recibidas se pueden reportar."}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    );

    /*
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.appScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.screenHeaderRow}>
          <View style={styles.screenHeaderCopy}>
            <Text style={styles.screenEyebrow}>Mensajes</Text>
            <Text style={styles.screenTitle}>Conversaciones reales, sin ruido.</Text>
            <Text style={styles.screenSubtleText}>
              {filteredMatches.length} conversaciones activas  |  {totalUnreadThreads} pendientes
            </Text>
          </View>
          <View style={styles.screenIconButton}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#ffd7e6" />
          </View>
        </View>

        <View style={styles.chatHeroCard}>
          <LinearGradient colors={["rgba(255,92,162,0.18)", "rgba(255,92,162,0.02)", "rgba(255,255,255,0.02)"]} style={styles.chatHeroGlow} />
          <View style={styles.chatHeroTop}>
            <View style={styles.chatHeroCopy}>
              <Text style={styles.chatHeroTitle}>
                {selectedMatch ? `${selectedMatch!.otherUser.displayName} esta en tu radar` : "Tu bandeja esta lista"}
              </Text>
              <Text style={styles.chatHeroText}>
                {selectedMatch
                  ? selectedPrompt
                  : "Cuando un like se vuelve mutuo, la conversacion aparece aqui con acceso libre y directo."}
              </Text>
            </View>
            <View style={styles.chatHeroBadge}>
              <Text style={styles.chatHeroBadgeText}>{selectedThreadUnread > 0 ? `${selectedThreadUnread} nuevo${selectedThreadUnread > 1 ? "s" : ""}` : "sin ruido"}</Text>
            </View>
          </View>

          <View style={styles.chatHeroStatRow}>
            <View style={styles.chatHeroStatPill}>
              <Ionicons name="sparkles-outline" size={14} color="#ff8abf" />
              <Text style={styles.chatHeroStatText}>{filteredMatches.length} chats reales</Text>
            </View>
            <View style={[styles.chatHeroStatPill, styles.chatHeroStatPillAccent]}>
              <Ionicons name="heart-outline" size={14} color="#fff4fa" />
              <Text style={styles.chatHeroStatTextStrong}>
                {selectedMatch ? `${selectedMatch!.otherUser.compatibilityScore}% afinidad` : `${totalUnreadThreads} por responder`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.searchGlassBar}>
          <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.6)" />
          <TextInput
            value={chatSearch}
            onChangeText={setChatSearch}
            placeholder="Busca por nombre o ciudad"
            placeholderTextColor="rgba(255,255,255,0.4)"
            selectionColor="#ff5ba1"
            style={styles.searchGlassInput}
          />
        </View>

        {filteredMatches.length === 0 ? (
          <View style={styles.emptyGlassCard}>
            <Text style={styles.emptyGlassTitle}>Todavia no tienes conversaciones.</Text>
            <Text style={styles.emptyGlassCopy}>Da algunos likes y cuando haya un match mutuo, el chat aparecera aqui con acceso libre.</Text>
          </View>
        ) : (
          <>
            <View style={styles.chatSectionHeader}>
              <Text style={styles.chatSectionTitle}>Conexiones activas</Text>
              <Text style={styles.chatSectionMeta}>{filteredMatches.length} chats</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatSpotlightStrip}>
              {filteredMatches.map((item) => {
                const unreadCount = unreadChatByMatchId.get(item.id) ?? 0;
                const active = selectedMatchId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => void openMatchThread(item.id)}
                    style={[styles.chatSpotlightCard, active ? styles.chatSpotlightCardActive : null]}
                  >
                    <View style={styles.chatSpotlightAvatarWrap}>
                      <Image source={{ uri: item.otherUser.photos[0] }} style={styles.chatSpotlightAvatar} />
                      {unreadCount > 0 ? (
                        <View style={styles.chatSpotlightUnreadBadge}>
                          <Text style={styles.chatSpotlightUnreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.chatSpotlightName} numberOfLines={1}>
                      {item.otherUser.displayName}
                    </Text>
                    <Text style={styles.chatSpotlightMeta}>{item.otherUser.compatibilityScore}%</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.chatConversationStack}>
              {filteredMatches.map((item) => {
                const unreadCount = unreadChatByMatchId.get(item.id) ?? 0;
                const active = selectedMatchId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => void openMatchThread(item.id)}
                    style={[styles.chatConversationRow, active ? styles.chatConversationRowActive : null]}
                  >
                    <View style={styles.chatConversationAvatarWrap}>
                      <Image source={{ uri: item.otherUser.photos[0] }} style={styles.messageListAvatar} />
                      {unreadCount > 0 ? (
                        <View style={styles.chatConversationUnreadBadge}>
                          <Text style={styles.chatConversationUnreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.messageListCopy}>
                      <View style={styles.chatConversationTitleRow}>
                        <Text style={styles.messageListName}>{item.otherUser.displayName}</Text>
                        <Text style={styles.chatConversationCity}>{item.otherUser.city}</Text>
                      </View>
                      <Text style={styles.messageListSnippet} numberOfLines={1}>
                        {item.lastMessage ?? "Abre la conversacion y rompe el hielo."}
                      </Text>
                    </View>

                    <View style={styles.chatConversationMeta}>
                      <Text style={styles.messageListTime}>{formatMoment(item.lastMessageAt ?? item.createdAt)}</Text>
                      <View style={[styles.chatConversationPill, active ? styles.chatConversationPillActive : null]}>
                        <Text style={[styles.chatConversationPillText, active ? styles.chatConversationPillTextActive : null]}>
                          {active ? "abierto" : `${item.otherUser.compatibilityScore}%`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {selectedMatch ? (
          <View style={styles.threadCard}>
            <LinearGradient colors={["rgba(255,85,159,0.16)", "rgba(255,85,159,0)", "rgba(255,255,255,0)"]} style={styles.threadHeroBand} />
            <View style={styles.threadHeader}>
              <View style={styles.threadHeaderProfile}>
                <Image source={{ uri: selectedMatch!.otherUser.photos[0] }} style={styles.threadHeaderAvatar} />
                <View style={styles.threadHeaderCopy}>
                  <Text style={styles.threadHeaderName}>
                    {selectedMatch!.otherUser.displayName}, {selectedMatch!.otherUser.age}
                  </Text>
                  <Text style={styles.threadHeaderMeta}>
                    {selectedMatch.otherUser.city} · {selectedMatch.otherUser.compatibilityScore}% de afinidad
                  </Text>
                </View>
              </View>
              <View style={styles.threadHeaderActions}>
                <View style={styles.threadStatusPill}>
                  <Text style={styles.threadStatusPillText}>match</Text>
                </View>
                <Pressable
                  onPress={() => openDiscoverProfile(selectedMatch!.otherUser.userId)}
                  style={({ pressed }) => [styles.threadProfileButton, pressed ? styles.welcomeButtonPressed : null]}
                >
                  <Text style={styles.threadProfileButtonText}>Ver perfil</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.threadMetricRow}>
              <View style={styles.threadMetricPill}>
                <Ionicons name="shield-checkmark-outline" size={14} color={selectedMatch!.otherUser.isVerified ? "#97ffc0" : "#ffd8e7"} />
                <Text style={styles.threadMetricText}>{selectedMatch!.otherUser.isVerified ? "Verificada" : "Activa"}</Text>
              </View>
              <View style={styles.threadMetricPill}>
                <Ionicons name="location-outline" size={14} color="#ffd8e7" />
                <Text style={styles.threadMetricText}>{selectedMatch!.otherUser.city}</Text>
              </View>
              <View style={[styles.threadMetricPill, styles.threadMetricPillAccent]}>
                <Ionicons name="notifications-outline" size={14} color="#fff7fb" />
                <Text style={styles.threadMetricTextStrong}>{selectedThreadUnread > 0 ? `${selectedThreadUnread} pendientes` : "al dia"}</Text>
              </View>
            </View>

            <View style={styles.threadContextCard}>
              <Text style={styles.threadContextLabel}>Vibra del chat</Text>
              <Text style={styles.threadContextCopy}>{selectedPrompt}</Text>
            </View>

            <ScrollView style={styles.threadMessages} contentContainerStyle={styles.threadMessagesContent} nestedScrollEnabled>
              {activeMessages.length === 0 ? (
                <View style={styles.threadEmptyState}>
                  <Text style={styles.threadEmptyTitle}>Todavia no rompieron el hielo.</Text>
                  <Text style={styles.threadEmptyCopy}>Aprovecha el match y arranca con algo claro, simple y humano.</Text>
                </View>
              ) : (
                activeMessages.map((message) => {
                  const mine = message.sender_user_id === session?.user.id;
                  return (
                    <View key={message.id} style={[styles.darkMessageBubble, mine ? styles.darkMessageBubbleMine : styles.darkMessageBubbleTheirs]}>
                      <Text style={[styles.darkMessageText, mine ? styles.darkMessageTextMine : styles.darkMessageTextTheirs]}>{message.content}</Text>
                      <Text style={[styles.darkMessageMeta, mine ? styles.darkMessageMetaMine : styles.darkMessageMetaTheirs]}>
                        {formatMoment(message.created_at)}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.quickStarterSection}>
              <Text style={styles.quickStarterSectionTitle}>Ideas para empezar</Text>
              <View style={styles.quickStarterRow}>
                {[
                  `Hola ${selectedMatch!.otherUser.displayName}, me gusto tu perfil.`,
                  "Tu energia se siente muy natural.",
                  "Si te va, empezamos con una charla simple.",
                ].map((starter) => (
                  <Pressable key={starter} onPress={() => void sendMessage(starter)} style={styles.quickStarterChip}>
                    <Text style={styles.quickStarterChipText}>{starter}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.threadComposerShell}>
              <View style={styles.threadComposer}>
                <TextInput
                  value={composer}
                  onChangeText={setComposer}
                  placeholder="Escribe algo claro y natural"
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  selectionColor="#ff5ba1"
                  multiline
                  style={styles.threadComposerInput}
                />
                <Pressable
                  onPress={() => void sendMessage()}
                  disabled={!canSendMessage}
                  style={({ pressed }) => [
                    styles.threadSendButtonWrap,
                    !canSendMessage ? styles.buttonDisabled : null,
                    pressed && canSendMessage ? styles.welcomeButtonPressed : null,
                  ]}
                >
                  <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.threadSendButton}>
                    <Ionicons name="send" size={17} color="#fff6fb" />
                    <Text style={styles.threadSendButtonText}>{busyKey === "message" ? "..." : "Enviar"}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        ) : filteredMatches.length > 0 ? (
          <View style={styles.infoGlassCard}>
            <Text style={styles.infoGlassTitle}>Elige una conversacion</Text>
            <Text style={styles.infoGlassCopy}>Toca uno de tus matches para abrir el hilo y responder desde aqui.</Text>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    );
    */
  }

  function renderActivityList(title: string, caption: string, items: ActivityItem[]) {
    return (
      <View style={styles.feedPanel}>
        <View style={styles.feedPanelHeader}>
          <View style={styles.feedPanelCopy}>
            <Text style={styles.feedPanelTitle}>{title}</Text>
            <Text style={styles.feedPanelCaption}>{caption}</Text>
          </View>
          <Text style={styles.feedPanelCount}>{items.length}</Text>
        </View>

        {items.length === 0 ? (
          <Text style={styles.feedPanelEmpty}>Todavia no hay movimiento aqui.</Text>
        ) : (
          <View style={styles.feedRows}>
            {items.map((item) => {
              const action = getActivityActionForUser(item.userId);
              return (
                <View key={`${title}-${item.userId}-${item.createdAt}`} style={styles.feedRowShell}>
                  <Pressable onPress={() => openActivityItem(item)} style={styles.feedRowPressable}>
                    <Image source={{ uri: item.primaryPhoto || "https://placehold.co/200x260/160915/ff4f96?text=Conexia" }} style={styles.feedRowAvatar} />
                    <View style={styles.feedRowCopy}>
                      <Text style={styles.feedRowName}>{item.displayName}</Text>
                      <Text style={styles.feedRowMeta}>{item.city}</Text>
                    </View>
                    <View style={styles.feedRowAside}>
                      <Text style={styles.feedRowTime}>{formatMoment(item.createdAt)}</Text>
                      <Text style={styles.feedRowActionText}>{action.label}</Text>
                    </View>
                  </Pressable>

                  <View style={styles.feedRowActionWrap}>
                    <Pressable onPress={action.onPress} style={({ pressed }) => [styles.feedRowActionButton, pressed ? styles.welcomeButtonPressed : null]}>
                      <Text style={styles.feedRowActionButtonText}>{action.label}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  function renderNotificationsCard() {
    const unreadLikes = notifications?.unreadByKind.like_received ?? 0;
    const unreadMatches = notifications?.unreadByKind.match_created ?? 0;
    const unreadMessages =
      (notifications?.unreadByKind.message_received ?? 0) + (notifications?.unreadByKind.direct_message_received ?? 0);
    const notificationItems = activityView === "notifications" ? (notifications?.notifications ?? []) : (notifications?.notifications ?? []).slice(0, 4);

    return (
      <View style={styles.feedPanel}>
        <View style={styles.feedPanelHeader}>
          <View style={styles.feedPanelCopy}>
            <Text style={styles.feedPanelTitle}>Notificaciones</Text>
            <Text style={styles.feedPanelCaption}>Likes, matches y mensajes nuevos entran aqui primero.</Text>
          </View>
          <View style={styles.feedPanelHeaderActions}>
            {notifications && (notifications.unreadCount ?? 0) > 0 ? (
              <Pressable
                onPress={() => void markNotificationsAsRead(undefined, false)}
                style={({ pressed }) => [styles.feedPanelHeaderButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Text style={styles.feedPanelHeaderButtonText}>Marcar todo</Text>
              </Pressable>
            ) : null}
            <Text style={styles.feedPanelCount}>{notifications?.unreadCount ?? 0}</Text>
          </View>
        </View>

        <View style={styles.notificationMiniGrid}>
          {[
            ["likes", unreadLikes],
            ["matches", unreadMatches],
            ["mensajes", unreadMessages],
          ].map(([label, value]) => (
            <View key={label} style={styles.notificationMiniCard}>
              <Text style={styles.notificationMiniValue}>{value}</Text>
              <Text style={styles.notificationMiniLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {notificationItems.length ? (
          <View style={styles.feedRows}>
            {notificationItems.map((item) => (
              <View key={item.id} style={[styles.notificationFeedRow, !item.isRead ? styles.notificationFeedRowUnread : null]}>
                <Pressable onPress={() => void openNotificationItem(item)} style={styles.notificationFeedRowPressable}>
                  <Image
                    source={{
                      uri: item.actor?.primaryPhoto || "https://placehold.co/200x260/160915/ff4f96?text=Conexia",
                    }}
                    style={styles.notificationFeedAvatar}
                  />
                  <View style={styles.notificationFeedCopy}>
                    <View style={styles.notificationFeedHeader}>
                      <Text style={styles.notificationFeedTitle}>{item.title}</Text>
                      {!item.isRead ? <View style={styles.notificationFeedDot} /> : null}
                    </View>
                    <Text style={styles.notificationFeedBody}>{item.body}</Text>
                    <Text style={styles.notificationFeedMeta}>{formatMoment(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.notificationFeedAction}>{item.matchId ? "Abrir" : item.actor ? "Ver" : "Ir"}</Text>
                </Pressable>

                <View style={styles.notificationFeedButtonRow}>
                  <Pressable
                    onPress={() => void openNotificationItem(item)}
                    style={({ pressed }) => [styles.notificationFeedButton, pressed ? styles.welcomeButtonPressed : null]}
                  >
                    <Text style={styles.notificationFeedButtonText}>{item.matchId ? "Ir al chat" : item.actor ? "Abrir perfil" : "Abrir"}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.feedPanelEmpty}>No tienes notificaciones nuevas ahora mismo.</Text>
        )}
      </View>
    );
  }

  function renderActivityTab() {
    const verifiedProfiles = discoverProfilesSource.filter((profile) => profile.isVerified).length;
    const activityTabs: Array<{ key: ActivityView; label: string; count: number }> = [
      {
        key: "all",
        label: "Todo",
        count:
          (notifications?.unreadCount ?? notifications?.notifications.length ?? 0) +
          (activity?.viewsReceived.length ?? 0) +
          (activity?.likesReceived.length ?? 0),
      },
      {
        key: "notifications",
        label: "Alertas",
        count: notifications?.unreadCount ?? notifications?.notifications.length ?? 0,
      },
      {
        key: "visits",
        label: "Visitas",
        count: (activity?.viewsReceived.length ?? 0) + (activity?.viewsSent.length ?? 0),
      },
      {
        key: "likes",
        label: "Likes",
        count: activity?.likesReceived.length ?? 0,
      },
    ];

    return (
      <ScrollView contentContainerStyle={styles.appScroll}>
        <View style={styles.screenHeaderRow}>
          <View style={styles.screenHeaderCopy}>
            <Text style={styles.screenEyebrow}>Actividad</Text>
            <Text style={styles.screenTitle}>Todo lo que se mueve a tu alrededor.</Text>
          </View>
          <View style={styles.screenIconButton}>
            <Ionicons name="sparkles-outline" size={20} color="#ffd7e6" />
          </View>
        </View>

        <View style={styles.discoveryHeroCard}>
          <View style={styles.discoveryHeroOrb} />
          <View style={styles.discoveryHeroRing}>
            <Ionicons name="location-outline" size={24} color="#ff6aac" />
            <Text style={styles.discoveryHeroTitle}>A tu alrededor</Text>
            <Text style={styles.discoveryHeroCopy}>
              {session?.profile.city ? `Encuentra personas cerca de ${session.profile.city}.` : "Encuentra personas cerca de ti."}
            </Text>
          </View>
        </View>

        <View style={styles.discoveryMiniRow}>
          <View style={styles.discoveryMiniCard}>
            <Ionicons name="heart-circle-outline" size={24} color="#ff5ea4" />
            <Text style={styles.discoveryMiniTitle}>Conexiones del alma</Text>
            <Text style={styles.discoveryMiniValue}>{matches.length + (activity?.likesReceived.length ?? 0)}</Text>
          </View>
          <View style={styles.discoveryMiniCard}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#ff8bc0" />
            <Text style={styles.discoveryMiniTitle}>Personas verificadas</Text>
            <Text style={styles.discoveryMiniValue}>{verifiedProfiles}</Text>
          </View>
        </View>

        <View style={styles.recentPulseCard}>
          <Text style={styles.recentPulseTitle}>Actividad reciente</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentPulseStrip}>
            {activityPulse.map((item) => (
              <Pressable key={`pulse-${item.userId}`} onPress={() => openActivityItem(item)} style={styles.recentPulseAvatarWrap}>
                <Image source={{ uri: item.primaryPhoto }} style={styles.recentPulseAvatar} />
                <Text style={styles.recentPulseName} numberOfLines={1}>{item.displayName}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityTabStrip}>
          {activityTabs.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setActivityView(item.key)}
              style={[styles.activityTabPill, activityView === item.key ? styles.activityTabPillActive : null]}
            >
              <Text style={[styles.activityTabPillText, activityView === item.key ? styles.activityTabPillTextActive : null]}>
                {item.label}
              </Text>
              <View style={[styles.activityTabCount, activityView === item.key ? styles.activityTabCountActive : null]}>
                <Text style={[styles.activityTabCountText, activityView === item.key ? styles.activityTabCountTextActive : null]}>
                  {item.count}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {activityView === "all" || activityView === "notifications" ? renderNotificationsCard() : null}
        {activityView === "all" || activityView === "visits"
          ? renderActivityList("Quien vio tu perfil", "Visitas recientes a tu perfil.", activity?.viewsReceived ?? [])
          : null}
        {activityView === "all" || activityView === "visits"
          ? renderActivityList("A quien visitaste", "Lo ultimo que has explorado.", activity?.viewsSent ?? [])
          : null}
        {activityView === "all" || activityView === "likes"
          ? renderActivityList("Likes recibidos", "Senales utiles para no perder oportunidades.", activity?.likesReceived ?? [])
          : null}
      </ScrollView>
    );
  }

  function renderProfileTab() {
    if (!session) {
      return null;
    }

    const visibleName = session.profile.displayName || session.user.fullName;
    const likesReceivedCount = activity?.likesReceived.length ?? 0;
    const viewsReceivedCount = activity?.viewsReceived.length ?? 0;
    const profilePhotos = fillPhotoSlots(session.profile.photos).filter(Boolean);
    const heroPhoto = profilePreviewPhoto || profilePhotos[0] || "https://placehold.co/480x480/160915/ff4f96?text=Conexia";
    const profileSections: Array<{ key: ProfileSection; label: string; count?: number }> = [
      { key: "about", label: "Resumen" },
      { key: "photos", label: "Fotos", count: profilePhotos.length },
      { key: "account", label: "Cuenta" },
    ];

    return (
      <ScrollView contentContainerStyle={styles.appScroll}>
        <View style={styles.screenHeaderRow}>
          <View style={styles.screenHeaderCopy}>
            <Text style={styles.screenEyebrow}>Mi perfil</Text>
            <Text style={styles.screenTitle}>Asi te ve la gente en Conexia.</Text>
          </View>
          <Pressable onPress={openProfileCompletion} style={styles.screenIconButton}>
            <Ionicons name="create-outline" size={20} color="#ffd7e6" />
          </Pressable>
        </View>

        <View style={styles.profileHeroCardDark}>
          <View style={styles.profileAvatarRing}>
            <Image
              source={{
                uri: heroPhoto,
              }}
              style={styles.profileAvatarDark}
            />
          </View>
          <Text style={styles.profileHeroNameDark}>
            {visibleName}, {session.user.age}
          </Text>
          <Text style={styles.profileHeroMetaDark}>
            {session.profile.city || session.user.city}  •  {session.profile.zodiacSign || "sin signo"}
          </Text>
          <Text style={styles.profileHeroMetaSubtle}>
            {genderIdentityLabel(session.profile.genderIdentity)}  •  Busca:{" "}
            {session.profile.seeking.length > 0 ? session.profile.seeking.map(genderIdentityLabel).join(", ") : "sin definir"}
          </Text>

          <View style={styles.profileBadgeRowDark}>
            <View style={styles.profileBadgeDark}>
              <Ionicons name={session.profile.isVerified ? "shield-checkmark" : "shield-outline"} size={12} color={session.profile.isVerified ? "#8bffb2" : "#ffd7e6"} />
              <Text style={styles.profileBadgeDarkText}>{session.profile.isVerified ? "Verificada" : "Pendiente"}</Text>
            </View>
            <View style={styles.profileBadgeDark}>
              <Ionicons name="flash-outline" size={12} color="#ffd7e6" />
              <Text style={styles.profileBadgeDarkText}>{session.user.plan === "plus" ? "VIP" : "FREE"}</Text>
            </View>
          </View>

          <View style={styles.profileMetricGridDark}>
            <View style={styles.profileMetricCardDark}>
              <Text style={styles.profileMetricValueDark}>{likesReceivedCount}</Text>
              <Text style={styles.profileMetricLabelDark}>likes</Text>
            </View>
            <View style={styles.profileMetricCardDark}>
              <Text style={styles.profileMetricValueDark}>{viewsReceivedCount}</Text>
              <Text style={styles.profileMetricLabelDark}>vistas</Text>
            </View>
            <View style={styles.profileMetricCardDark}>
              <Text style={styles.profileMetricValueDark}>{matches.length}</Text>
              <Text style={styles.profileMetricLabelDark}>matches</Text>
            </View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityTabStrip}>
          {profileSections.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setProfileSection(item.key)}
              style={[styles.activityTabPill, profileSection === item.key ? styles.activityTabPillActive : null]}
            >
              <Text style={[styles.activityTabPillText, profileSection === item.key ? styles.activityTabPillTextActive : null]}>
                {item.label}
              </Text>
              {typeof item.count === "number" ? (
                <View style={[styles.activityTabCount, profileSection === item.key ? styles.activityTabCountActive : null]}>
                  <Text style={[styles.activityTabCountText, profileSection === item.key ? styles.activityTabCountTextActive : null]}>
                    {item.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        {profileSection === "about" ? (
          <>
            <View style={styles.feedPanel}>
              <View style={styles.feedPanelHeader}>
                <View style={styles.feedPanelCopy}>
                  <Text style={styles.feedPanelTitle}>Sobre mi</Text>
                  <Text style={styles.feedPanelCaption}>Tu bio, gustos y tono general.</Text>
                </View>
                <Text style={styles.feedPanelCount}>{session.profile.interests.length}</Text>
              </View>

              <Text style={styles.profileBodyCopyDark}>
                {session.profile.bio || "Completa tu descripcion para que conecte mejor con la persona correcta."}
              </Text>

              <View style={styles.profilePromptCard}>
                <Text style={styles.profilePromptLabel}>Identidad</Text>
                <Text style={styles.profilePromptText}>{genderIdentityLabel(session.profile.genderIdentity)}</Text>
                <Text style={[styles.profilePromptLabel, styles.profilePromptLabelSpaced]}>Buscando</Text>
                <View style={styles.profileDarkChipRow}>
                  {session.profile.seeking.length > 0 ? (
                    session.profile.seeking.map((item) => (
                      <View key={item} style={styles.profileDarkChip}>
                        <Text style={styles.profileDarkChipText}>{genderIdentityLabel(item)}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.profileDarkChip}>
                      <Text style={styles.profileDarkChipText}>Sin definir</Text>
                    </View>
                  )}
                </View>
              </View>

              {session.profile.prompts[0] ? (
                <View style={styles.profilePromptCard}>
                  <Text style={styles.profilePromptLabel}>Tu plan ideal</Text>
                  <Text style={styles.profilePromptText}>{session.profile.prompts[0]}</Text>
                </View>
              ) : null}

              <View style={styles.profileDarkChipRow}>
                {session.profile.interests.map((interest) => (
                  <View key={interest} style={styles.profileDarkChip}>
                    <Text style={styles.profileDarkChipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.profileMiniMetricsRow}>
              <View style={styles.profileMiniMetricCard}>
                <Text style={styles.profileMiniMetricValue}>{activity?.viewsSent.length ?? 0}</Text>
                <Text style={styles.profileMiniMetricLabel}>Perfiles vistos</Text>
              </View>
              <View style={styles.profileMiniMetricCard}>
                <Text style={styles.profileMiniMetricValue}>{activity?.likesReceived.length ?? 0}</Text>
                <Text style={styles.profileMiniMetricLabel}>Interes recibido</Text>
              </View>
            </View>
          </>
        ) : null}

        {profileSection === "photos" ? (
          <View style={styles.feedPanel}>
            <View style={styles.feedPanelHeader}>
              <View style={styles.feedPanelCopy}>
                <Text style={styles.feedPanelTitle}>Mis fotos</Text>
                <Text style={styles.feedPanelCaption}>Toca una foto para verla como principal.</Text>
              </View>
              <Text style={styles.feedPanelCount}>{profilePhotos.length}</Text>
            </View>

            <View style={styles.profilePhotoPreviewCard}>
              <Image source={{ uri: heroPhoto }} style={styles.profilePhotoPreviewImage} />
            </View>

            <View style={styles.profileDarkPhotoRow}>
              {fillPhotoSlots(session.profile.photos).map((photo, index) => (
                <Pressable
                  key={index}
                  onPress={() => photo && setProfilePreviewPhoto(photo)}
                  style={[styles.profileDarkPhotoSlot, index === 0 ? styles.profileDarkPhotoSlotHero : null, photo && heroPhoto === photo ? styles.profileDarkPhotoSlotActive : null]}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.profileDarkPhotoImage} />
                  ) : (
                    <View style={styles.profileDarkPhotoPlaceholder}>
                      <Text style={styles.profileDarkPhotoPlaceholderText}>{index === 0 ? "Principal" : `Foto ${index}`}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable onPress={openProfileCompletion} style={({ pressed }) => [styles.secondaryWideButton, pressed ? styles.welcomeButtonPressed : null]}>
              <Text style={styles.secondaryWideButtonText}>Editar fotos</Text>
            </Pressable>
          </View>
        ) : null}

        {profileSection === "account" ? (
          <>
            <View style={styles.feedPanel}>
              <View style={styles.feedPanelHeader}>
                <View style={styles.feedPanelCopy}>
                  <Text style={styles.feedPanelTitle}>Cuenta</Text>
                  <Text style={styles.feedPanelCaption}>Gestiona tu perfil, verificacion y plan.</Text>
                </View>
                <Text style={styles.feedPanelCount}>{session.user.plan.toUpperCase()}</Text>
              </View>

              <View style={styles.accountStatusGrid}>
                <View style={styles.accountStatusCard}>
                  <Text style={styles.accountStatusValue}>{session.profile.isVerified ? "Activa" : "Pendiente"}</Text>
                  <Text style={styles.accountStatusLabel}>Verificacion</Text>
                </View>
                <View style={styles.accountStatusCard}>
                  <Text style={styles.accountStatusValue}>{discover?.likesRemaining ?? "∞"}</Text>
                  <Text style={styles.accountStatusLabel}>Likes hoy</Text>
                </View>
              </View>
            </View>

            <View style={styles.feedPanel}>
              <View style={styles.feedPanelHeader}>
                <View style={styles.feedPanelCopy}>
                  <Text style={styles.feedPanelTitle}>Beta cerrada</Text>
                  <Text style={styles.feedPanelCaption}>Este bloque deja claro que queremos que prueben ahora mismo.</Text>
                </View>
                <Text style={styles.feedPanelCount}>QA</Text>
              </View>

              <View style={styles.betaChecklist}>
                {[
                  "Registro y verificacion completa",
                  "Match, swipe y mensaje inicial",
                  "Chat con texto, foto y voz",
                  "Actividad, visitas y likes",
                ].map((item) => (
                  <View key={item} style={styles.betaChecklistRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#ff7cb7" />
                    <Text style={styles.betaChecklistText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.profileActionStackDark}>
              <Pressable onPress={openProfileCompletion} style={({ pressed }) => [styles.primaryWideButtonWrap, pressed ? styles.welcomeButtonPressed : null]}>
                <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryWideButton}>
                  <Text style={styles.primaryWideButtonText}>Editar perfil</Text>
                </LinearGradient>
              </Pressable>

              {!session.profile.isVerified ? (
                <Pressable onPress={() => setFlow("verify")} style={({ pressed }) => [styles.secondaryWideButton, pressed ? styles.welcomeButtonPressed : null]}>
                  <Text style={styles.secondaryWideButtonText}>Verificar ahora</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => setNotice("VIP queda para la siguiente fase. Primero cerramos la base movil.")}
                style={({ pressed }) => [styles.secondaryWideButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Text style={styles.secondaryWideButtonText}>VIP pronto</Text>
              </Pressable>

              <Pressable
                onPress={() => void deleteMyAccount()}
                style={({ pressed }) => [styles.ghostWideButton, pressed ? styles.welcomeButtonPressed : null]}
              >
                <Text style={styles.ghostWideButtonText}>{busyKey === "delete-account" ? "Eliminando..." : "Eliminar cuenta"}</Text>
              </Pressable>

              <Pressable onPress={logout} style={({ pressed }) => [styles.ghostWideButton, pressed ? styles.welcomeButtonPressed : null]}>
                <Text style={styles.ghostWideButtonText}>Cerrar sesion</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    );
  }

  function renderFiltersOverlay() {
    const previewCount = filterDiscoverProfiles(discoverProfilesSource, normalizeMatchFilters(draftMatchFilters), session?.profile.city).length;

    return (
      <View style={styles.filterOverlay}>
        <Pressable style={styles.filterOverlayBackdrop} onPress={closeFilters} />
        <View style={styles.filterSheet}>
          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>Filtros</Text>
            <Pressable onPress={closeFilters} style={styles.filterCloseButton}>
              <Ionicons name="close-outline" size={22} color="#fff5fa" />
            </Pressable>
          </View>

          <View style={styles.filterMetaRow}>
            <Text style={styles.filterMetaText}>{previewCount} perfiles con esta configuracion</Text>
            <Pressable onPress={resetDraftFilters} style={styles.filterResetButton}>
              <Text style={styles.filterResetButtonText}>Restablecer</Text>
            </Pressable>
          </View>

          <Text style={styles.filterSectionLabel}>Ubicacion</Text>
          <View style={styles.radiusRow}>
            {radiusOptions.map((radius) => (
              <Pressable
                key={radius}
                onPress={() => setDraftMatchFilters((current) => ({ ...current, radiusKm: radius }))}
                style={[styles.radiusChip, draftMatchFilters.radiusKm === radius ? styles.radiusChipActive : null]}
              >
                <Text style={[styles.radiusChipText, draftMatchFilters.radiusKm === radius ? styles.radiusChipTextActive : null]}>{radius} km</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterSectionLabel}>Rango de edad</Text>
          <View style={styles.ageRangeRow}>
            <TextInput
              value={draftMatchFilters.minAge}
              onChangeText={(value) => setDraftMatchFilters((current) => ({ ...current, minAge: value.replace(/[^0-9]/g, "") }))}
              keyboardType="numeric"
              placeholder="22"
              placeholderTextColor="rgba(255,255,255,0.35)"
              selectionColor="#ff5ba1"
              style={styles.ageRangeInput}
            />
            <View style={styles.ageRangeDivider} />
            <TextInput
              value={draftMatchFilters.maxAge}
              onChangeText={(value) => setDraftMatchFilters((current) => ({ ...current, maxAge: value.replace(/[^0-9]/g, "") }))}
              keyboardType="numeric"
              placeholder="35"
              placeholderTextColor="rgba(255,255,255,0.35)"
              selectionColor="#ff5ba1"
              style={styles.ageRangeInput}
            />
          </View>

          <Text style={styles.filterSectionLabel}>Intereses</Text>
          <View style={styles.filterChipWrap}>
            {interestOptions.map((interest) => {
              const selected = draftMatchFilters.interests.includes(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() =>
                    setDraftMatchFilters((current) => ({
                      ...current,
                      interests: selected
                        ? current.interests.filter((item) => item !== interest)
                        : [...current.interests, interest],
                    }))
                  }
                  style={[styles.filterInterestChip, selected ? styles.filterInterestChipActive : null]}
                >
                  <Text style={[styles.filterInterestChipText, selected ? styles.filterInterestChipTextActive : null]}>{interest}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterSectionLabel}>Mis preferencias</Text>
          <View style={styles.preferenceStack}>
            {[
              ["Solo personas verificadas", "verifiedOnly"],
              ["Conexion alta", "highConnectionOnly"],
            ].map(([label, key]) => {
              const stateKey = key as "verifiedOnly" | "highConnectionOnly";
              const active = draftMatchFilters[stateKey];
              return (
                <Pressable
                  key={stateKey}
                  onPress={() => setDraftMatchFilters((current) => ({ ...current, [stateKey]: !current[stateKey] }))}
                  style={styles.preferenceRow}
                >
                  <Text style={styles.preferenceLabel}>{label}</Text>
                  <View style={[styles.preferenceToggle, active ? styles.preferenceToggleActive : null]}>
                    <View style={[styles.preferenceToggleThumb, active ? styles.preferenceToggleThumbActive : null]} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={applyFilters} style={({ pressed }) => [styles.primaryWideButtonWrap, pressed ? styles.welcomeButtonPressed : null]}>
            <LinearGradient colors={["#ff5aa0", "#ff2f86", "#ec006b"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryWideButton}>
              <Text style={styles.primaryWideButtonText}>
                {hasPendingFilterChanges ? `Aplicar filtros${previewCount ? ` (${previewCount})` : ""}` : "Cerrar"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderAppShell() {
    const chatUnread = (notifications?.unreadByKind.message_received ?? 0) + (notifications?.unreadByKind.match_created ?? 0);
    const activityUnread =
      (notifications?.unreadByKind.like_received ?? 0) + (notifications?.unreadByKind.direct_message_received ?? 0);
    const showPreviewNotice = notice && !previewMode;

    return (
      <View style={styles.appStage}>
        <LinearGradient colors={["#040208", "#080410", "#110514"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.appGlow, styles.appGlowTop]} />
        <View style={[styles.appGlow, styles.appGlowBottom]} />
        <View style={styles.appBeam} />

        <View style={styles.flex}>
          {tab === "match" ? renderMatchTab() : null}
          {tab === "chat" ? renderChatTab() : null}
          {tab === "activity" ? renderActivityTab() : null}
          {tab === "profile" ? renderProfileTab() : null}
        </View>

        {showPreviewNotice ? (
          <View style={styles.appNoticeToast}>
            <Text style={styles.appNoticeToastText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.bottomNavDark}>
          {[
            ["match", "Match", "heart-outline", "heart", 0],
            ["chat", "Mensajes", "chatbubble-ellipses-outline", "chatbubble-ellipses", chatUnread],
            ["activity", "Actividad", "sparkles-outline", "sparkles", activityUnread],
            ["profile", "Perfil", "person-outline", "person", 0],
          ].map(([value, label, idleIcon, activeIcon, badge]) => (
            <Pressable
              key={value}
              onPress={() => {
                setShowFilters(false);
                setTab(value as AppTab);
              }}
              style={styles.bottomNavDarkItem}
            >
              <View style={styles.bottomNavDarkIconWrap}>
                <Ionicons
                  name={(tab === value ? activeIcon : idleIcon) as keyof typeof Ionicons.glyphMap}
                  size={21}
                  color={tab === value ? "#ff5aa0" : "rgba(255,255,255,0.48)"}
                />
                {Number(badge) > 0 ? (
                  <View style={styles.bottomNavDarkBadge}>
                    <Text style={styles.bottomNavDarkBadgeText}>{Number(badge) > 9 ? "9+" : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.bottomNavDarkText, tab === value ? styles.bottomNavDarkTextActive : null]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {showFilters ? renderFiltersOverlay() : null}
        {showMatchPhotoViewer ? renderMatchPhotoViewerOverlay() : null}
        {showDirectMessageComposer ? renderDirectMessageComposerOverlay() : null}
        {reportTargetProfile ? renderProfileReportOverlay() : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, isDarkStage ? styles.safeDarkStage : null]}>
      <StatusBar style={isDarkStage ? "light" : "dark"} />
      {!isDarkStage ? <RomanticBackdrop /> : null}

      {flow === "welcome" ? renderWelcome() : null}
      {flow === "login" ? renderLogin() : null}
      {flow === "register" || flow === "complete-profile" ? renderWizard() : null}
      {flow === "verify" ? renderVerification() : null}
      {flow === "app" ? renderAppShell() : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fdf4f5",
  },
  safeDarkStage: {
    backgroundColor: "#05040b",
  },
  flex: {
    flex: 1,
  },
  welcomeStage: {
    flex: 1,
    backgroundColor: "#020107",
    overflow: "hidden",
  },
  welcomeHeroImageWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeHeroImage: {
    width: "122%",
    height: "100%",
  },
  welcomeImageShade: {
    ...StyleSheet.absoluteFillObject,
  },
  welcomeBottomGlow: {
    position: "absolute",
    left: "50%",
    bottom: 118,
    width: 430,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255, 35, 118, 0.18)",
    transform: [{ translateX: -215 }],
  },
  welcomeActionsDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 42,
    paddingHorizontal: 32,
    zIndex: 2,
  },
  welcomeCtaStack: {
    gap: 20,
  },
  welcomeButtonWrap: {
    borderRadius: 24,
  },
  welcomeButtonPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  welcomeButtonCore: {
    minHeight: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 28,
    shadowColor: "#ff2376",
    shadowOpacity: 0.38,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  welcomeButtonCoreSecondary: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255, 68, 145, 0.76)",
    shadowColor: "#ff2778",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  welcomeButtonText: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "700",
  },
  welcomeButtonArrowCircle: {
    position: "absolute",
    right: 28,
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeButtonArrowCirclePrimary: {
    borderColor: "rgba(255,255,255,0.72)",
  },
  welcomeButtonArrow: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "700",
    marginTop: -2,
  },
  welcomeHandle: {
    alignSelf: "center",
    marginTop: 28,
    width: 138,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  blurOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.7,
  },
  blurOrbTop: {
    width: 260,
    height: 260,
    backgroundColor: "#ffd5de",
    top: -40,
    right: -70,
  },
  blurOrbMiddle: {
    width: 220,
    height: 220,
    backgroundColor: "#f1d4ff",
    top: 250,
    left: -90,
  },
  blurOrbBottom: {
    width: 320,
    height: 320,
    backgroundColor: "#ffe9cf",
    bottom: -120,
    right: -110,
  },
  splashWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoHalo: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#ffdce3",
  },
  logoCore: {
    width: 132,
    height: 132,
    borderRadius: 40,
    backgroundColor: "#7f3043",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7f3043",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  logoHeart: {
    fontSize: 52,
    color: "#fff4f5",
    lineHeight: 58,
  },
  splashBrand: {
    marginTop: 30,
    fontSize: 32,
    fontWeight: "800",
    color: "#fff4f8",
    letterSpacing: 0.4,
  },
  splashCopy: {
    marginTop: 10,
    textAlign: "center",
    color: "#f1d6de",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 280,
  },
  screenPad: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 110,
    gap: 16,
  },
  tabScroll: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 120,
    gap: 16,
  },
  heroStack: {
    padding: 26,
    borderRadius: 32,
    backgroundColor: "#fff8f8",
    borderWidth: 1,
    borderColor: "#f4d7dd",
    shadowColor: "#88445a",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  welcomeLogoWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
    marginBottom: 18,
  },
  welcomeLogoCore: {
    width: 92,
    height: 92,
    borderRadius: 30,
    backgroundColor: "#7f3043",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7f3043",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  welcomeLogoHeart: {
    color: "#fff4f5",
    fontSize: 38,
    lineHeight: 42,
  },
  welcomeLogoSideCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#fff0f1",
    borderWidth: 1,
    borderColor: "#f0d3da",
  },
  welcomeLogoSideTop: {
    color: "#8c6070",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  welcomeLogoSideText: {
    marginTop: 2,
    color: "#431d28",
    fontSize: 18,
    fontWeight: "800",
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#f7d8df",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  heroBadgeText: {
    color: "#7e3046",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 34,
    lineHeight: 40,
    color: "#251116",
    fontWeight: "900",
  },
  heroCopy: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    color: "#604952",
  },
  heroMetrics: {
    marginTop: 20,
    flexDirection: "row",
    gap: 10,
  },
  metricTile: {
    flex: 1,
    backgroundColor: "#fff0f1",
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  metricValue: {
    color: "#3c1923",
    fontSize: 20,
    fontWeight: "800",
  },
  metricLabel: {
    marginTop: 4,
    color: "#7a5962",
    fontSize: 12,
    lineHeight: 16,
  },
  welcomePanel: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: "#7f3043",
    shadowColor: "#7f3043",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  welcomeFeatureRow: {
    flexDirection: "row",
    gap: 12,
  },
  welcomeFeatureCard: {
    flex: 1,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#fff7f8",
    borderWidth: 1,
    borderColor: "#f0d7de",
  },
  welcomeFeatureTitle: {
    color: "#35171f",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  welcomeFeatureCopy: {
    marginTop: 8,
    color: "#715761",
    fontSize: 12,
    lineHeight: 18,
  },
  welcomeTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: "#fff5f6",
    fontWeight: "800",
  },
  welcomeCopy: {
    marginTop: 10,
    color: "#f6dbe2",
    fontSize: 14,
    lineHeight: 22,
  },
  buttonStack: {
    gap: 12,
    marginTop: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  flexButton: {
    flex: 1,
  },
  buttonBase: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: "#7f3043",
  },
  buttonSoft: {
    backgroundColor: "#f5dce2",
  },
  buttonGhost: {
    backgroundColor: "#fff7f8",
    borderWidth: 1,
    borderColor: "#ebc8d2",
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  buttonLabelPrimary: {
    color: "#fff6f7",
  },
  buttonLabelSoft: {
    color: "#64283a",
  },
  buttonLabelGhost: {
    color: "#6c3144",
  },
  sectionCard: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#fff9fa",
    borderWidth: 1,
    borderColor: "#f1d8dd",
    shadowColor: "#8d5668",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  sectionCardDark: {
    backgroundColor: "rgba(7, 5, 16, 0.74)",
    borderColor: "rgba(255, 93, 160, 0.28)",
    shadowColor: "#ff2a7f",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: "#241218",
    fontWeight: "800",
  },
  sectionTitleDark: {
    color: "#fff6fa",
  },
  sectionCaption: {
    marginTop: 8,
    marginBottom: 18,
    color: "#6f5960",
    fontSize: 14,
    lineHeight: 21,
  },
  sectionCaptionDark: {
    color: "rgba(255, 229, 238, 0.72)",
  },
  fieldWrap: {
    marginBottom: 14,
  },
  inlineFieldLabel: {
    marginBottom: 10,
    color: "#ffd7e6",
    fontSize: 13,
    fontWeight: "800",
  },
  inlineFieldLabelSpaced: {
    marginTop: 18,
  },
  fieldLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: "#6e4350",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fieldLabelDark: {
    color: "#ffd4e1",
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edd6dc",
    color: "#251218",
    fontSize: 15,
  },
  inputDark: {
    backgroundColor: "rgba(0,0,0,0.34)",
    borderColor: "rgba(255, 93, 160, 0.3)",
    color: "#ffffff",
  },
  inputMultiline: {
    minHeight: 110,
  },
  helperCopy: {
    textAlign: "center",
    color: "#7b6570",
    fontSize: 13,
    lineHeight: 19,
  },
  authTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  authTopBarText: {
    color: "#7d6070",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  inlineGhostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff7f8",
    borderWidth: 1,
    borderColor: "#ebcfd7",
  },
  inlineGhostText: {
    color: "#6f3144",
    fontSize: 13,
    fontWeight: "800",
  },
  loginStage: {
    flex: 1,
    backgroundColor: "#020107",
    overflow: "hidden",
  },
  loginBackgroundWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBackgroundImage: {
    width: "124%",
    height: "100%",
  },
  loginShade: {
    ...StyleSheet.absoluteFillObject,
  },
  loginScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 22,
    justifyContent: "space-between",
  },
  loginTopBar: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  loginBackButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.26)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  loginBackText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "700",
  },
  loginDock: {
    paddingBottom: 6,
  },
  loginHeroCard: {
    marginBottom: 18,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "rgba(8, 5, 18, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 108, 177, 0.24)",
  },
  loginHeroKicker: {
    color: "#ffd2e2",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  loginHeroTitle: {
    marginTop: 10,
    color: "#fff8fb",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
  },
  loginHeroCopy: {
    marginTop: 8,
    color: "rgba(255, 233, 241, 0.82)",
    fontSize: 14,
    lineHeight: 21,
  },
  loginNoticeCard: {
    marginBottom: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(33,5,14,0.74)",
    borderWidth: 1,
    borderColor: "rgba(255,102,171,0.34)",
  },
  loginNoticeText: {
    color: "#ffe7ef",
    fontSize: 14,
    lineHeight: 20,
  },
  loginFieldStack: {
    gap: 20,
  },
  loginFieldShell: {
    minHeight: 72,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,90,160,0.68)",
    backgroundColor: "rgba(0,0,0,0.28)",
    shadowColor: "#ff2d80",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    justifyContent: "center",
  },
  loginFieldIcon: {
    position: "absolute",
    left: 24,
  },
  loginFieldInput: {
    minHeight: 72,
    paddingLeft: 72,
    paddingRight: 18,
    color: "#ffffff",
    fontSize: 19,
  },
  loginFieldInputPassword: {
    minHeight: 72,
    paddingLeft: 72,
    paddingRight: 72,
    color: "#ffffff",
    fontSize: 19,
  },
  loginEyeButton: {
    position: "absolute",
    right: 22,
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  loginOptionsRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: 12,
  },
  loginRememberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  loginRememberMark: {
    height: 24,
    width: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  loginRememberMarkActive: {
    borderColor: "#ff5ba1",
    backgroundColor: "rgba(255,91,161,0.08)",
  },
  loginRememberCheck: {
    color: "#ff5ba1",
    fontSize: 15,
    fontWeight: "900",
  },
  loginRememberText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 15,
    fontWeight: "500",
  },
  loginPrimaryButtonWrap: {
    marginTop: 28,
    borderRadius: 28,
  },
  loginPrimaryButton: {
    minHeight: 72,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff2376",
    shadowOpacity: 0.48,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  loginPrimaryIcon: {
    marginRight: 14,
  },
  loginPrimaryText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
  },
  loginRegisterButton: {
    marginTop: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  loginRegisterText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 18,
    textAlign: "center",
  },
  loginRegisterAccent: {
    color: "#ff5ba1",
    fontWeight: "700",
  },
  loginHandle: {
    marginTop: 18,
    alignSelf: "center",
    width: 138,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  wizardStage: {
    flex: 1,
    backgroundColor: "#020107",
    overflow: "hidden",
  },
  onboardingBackdropGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  onboardingGlow: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.9,
  },
  onboardingGlowTop: {
    width: 280,
    height: 280,
    backgroundColor: "rgba(255, 63, 134, 0.22)",
    top: -70,
    right: -90,
  },
  onboardingGlowMid: {
    width: 240,
    height: 240,
    backgroundColor: "rgba(255, 119, 180, 0.14)",
    top: 230,
    left: -90,
  },
  onboardingGlowBottom: {
    width: 340,
    height: 340,
    backgroundColor: "rgba(255, 78, 148, 0.18)",
    bottom: -140,
    right: -110,
  },
  onboardingBeam: {
    position: "absolute",
    top: 120,
    right: 44,
    width: 1,
    height: 230,
    backgroundColor: "rgba(255, 146, 191, 0.18)",
    transform: [{ rotate: "24deg" }],
  },
  wizardScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 26,
    gap: 16,
  },
  wizardTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 20,
  },
  wizardBackButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  wizardBackText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "700",
  },
  wizardTopPill: {
    minWidth: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  wizardTopPillText: {
    color: "#fff5f8",
    fontSize: 13,
    fontWeight: "800",
  },
  wizardHeroCardDark: {
    padding: 24,
    borderRadius: 30,
    backgroundColor: "rgba(10, 7, 20, 0.74)",
    borderWidth: 1,
    borderColor: "rgba(255, 93, 160, 0.26)",
    shadowColor: "#ff2d80",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  wizardHeroKickerDark: {
    color: "#ffd8e6",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  wizardHeroTitleDark: {
    marginTop: 10,
    color: "#fff7fb",
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "900",
  },
  wizardHeroCopyDark: {
    marginTop: 10,
    color: "rgba(255, 231, 239, 0.8)",
    fontSize: 15,
    lineHeight: 23,
  },
  wizardRequirementCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255, 91, 161, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 114, 176, 0.22)",
  },
  wizardRequirementText: {
    flex: 1,
    flexShrink: 1,
    color: "rgba(255, 229, 238, 0.88)",
    fontSize: 13,
    lineHeight: 19,
  },
  locationAssistButton: {
    marginTop: -2,
    marginBottom: 14,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 93, 160, 0.28)",
    backgroundColor: "rgba(255, 91, 161, 0.08)",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  locationAssistButtonText: {
    color: "#ffd6e5",
    fontSize: 14,
    fontWeight: "700",
  },
  wizardProgressRowDark: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  wizardProgressDotDark: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  wizardProgressDotDarkActive: {
    backgroundColor: "#ff5aa0",
  },
  wizardFeedbackCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(38, 7, 16, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 104, 173, 0.36)",
  },
  wizardFeedbackText: {
    color: "#ffe5ee",
    fontSize: 14,
    lineHeight: 20,
  },
  wizardFooterRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  wizardFooterColumn: {
    gap: 12,
    marginTop: 18,
  },
  wizardGhostAction: {
    flex: 1,
    minHeight: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 18,
  },
  wizardGhostActionText: {
    color: "#fff5f8",
    fontSize: 16,
    fontWeight: "700",
  },
  wizardPrimaryActionWrap: {
    flex: 1.35,
    borderRadius: 22,
  },
  wizardPrimaryAction: {
    minHeight: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    shadowColor: "#ff2376",
    shadowOpacity: 0.44,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  wizardPrimaryActionText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
  },
  wizardHeroCard: {
    padding: 22,
    borderRadius: 28,
    backgroundColor: "#7f3043",
    shadowColor: "#7f3043",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  wizardHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  wizardHeroKicker: {
    color: "#f4d7df",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  wizardHeroTitle: {
    marginTop: 6,
    color: "#fff7f8",
    fontSize: 25,
    fontWeight: "800",
  },
  wizardHeroCounter: {
    minWidth: 58,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255, 244, 246, 0.18)",
    alignItems: "center",
  },
  wizardHeroCounterText: {
    color: "#fff8f9",
    fontSize: 13,
    fontWeight: "800",
  },
  wizardHeroCopy: {
    marginTop: 12,
    color: "#f7dfe5",
    fontSize: 14,
    lineHeight: 21,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  progressDot: {
    width: 26,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e7ced4",
  },
  progressDotActive: {
    backgroundColor: "#7f3043",
  },
  wizardSupportCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#fff3f5",
    borderWidth: 1,
    borderColor: "#f0d7de",
  },
  wizardSupportTitle: {
    color: "#3e1c26",
    fontSize: 14,
    fontWeight: "800",
  },
  wizardSupportCopy: {
    marginTop: 7,
    color: "#725b65",
    fontSize: 13,
    lineHeight: 19,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "#fff2f5",
    borderWidth: 1,
    borderColor: "#f0d3db",
  },
  choiceChipSelected: {
    backgroundColor: "#7f3043",
    borderColor: "#7f3043",
  },
  choiceChipDark: {
    backgroundColor: "rgba(0,0,0,0.22)",
    borderColor: "rgba(255, 93, 160, 0.28)",
  },
  choiceChipDarkSelected: {
    backgroundColor: "rgba(255, 48, 134, 0.22)",
    borderColor: "#ff5ca4",
  },
  choiceChipText: {
    color: "#713448",
    fontSize: 13,
    fontWeight: "700",
  },
  choiceChipTextDark: {
    color: "rgba(255,255,255,0.86)",
  },
  choiceChipTextSelected: {
    color: "#fff6f7",
  },
  choiceChipTextDarkSelected: {
    color: "#fff7fb",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoSlot: {
    width: "47%",
    aspectRatio: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#fff0f4",
    borderWidth: 1,
    borderColor: "#eed5dc",
  },
  photoSlotDark: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderColor: "rgba(255, 93, 160, 0.26)",
  },
  photoSlotHero: {
    width: "100%",
    aspectRatio: 0.84,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  photoPlaceholderTitle: {
    color: "#663042",
    fontSize: 15,
    fontWeight: "800",
  },
  photoPlaceholderTitleDark: {
    color: "#ffe7ef",
  },
  photoPlaceholderCopy: {
    marginTop: 6,
    color: "#826470",
    fontSize: 12,
  },
  photoPlaceholderCopyDark: {
    color: "rgba(255,255,255,0.6)",
  },
  requirementList: {
    gap: 10,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  requirementDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#8f2943",
    marginTop: 5,
  },
  requirementText: {
    flex: 1,
    color: "#5c434b",
    fontSize: 14,
    lineHeight: 20,
  },
  verificationCopy: {
    color: "#5f4850",
    fontSize: 15,
    lineHeight: 23,
  },
  verifyGateCard: {
    padding: 24,
    borderRadius: 30,
    backgroundColor: "#fff6f7",
    borderWidth: 1,
    borderColor: "#f1d6dd",
    shadowColor: "#8d5668",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  verifyGateBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#7f3043",
  },
  verifyGateBadgeText: {
    color: "#fff6f7",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  verifyGateTitle: {
    marginTop: 16,
    color: "#291218",
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
  },
  verifyGateCopy: {
    marginTop: 10,
    marginBottom: 16,
    color: "#634a53",
    fontSize: 14,
    lineHeight: 22,
  },
  cameraStage: {
    marginTop: 18,
    overflow: "hidden",
    borderRadius: 26,
  },
  cameraView: {
    width: "100%",
    aspectRatio: 0.8,
    backgroundColor: "#1d0f14",
  },
  cameraActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
  },
  verificationInfoCard: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "rgba(10, 7, 20, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 100, 170, 0.22)",
    gap: 8,
  },
  verificationInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verificationInfoText: {
    flex: 1,
    color: "#fff2f7",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  verificationInfoHint: {
    color: "rgba(255, 227, 236, 0.76)",
    fontSize: 13,
    lineHeight: 19,
  },
  verificationPreviewWrap: {
    marginTop: 18,
  },
  verificationPreview: {
    width: "100%",
    aspectRatio: 0.8,
    borderRadius: 26,
  },
  appHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
  },
  appBrand: {
    color: "#7f3043",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  appHeadline: {
    marginTop: 4,
    color: "#251116",
    fontSize: 24,
    fontWeight: "800",
  },
  appSubheadline: {
    marginTop: 4,
    color: "#7a5d68",
    fontSize: 12,
    lineHeight: 17,
  },
  likesBadge: {
    borderRadius: 999,
    backgroundColor: "#fff0f3",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  likesBadgeWarn: {
    backgroundColor: "#ffe4dd",
  },
  likesBadgeText: {
    color: "#713347",
    fontSize: 12,
    fontWeight: "800",
  },
  profileHeroCard: {
    position: "relative",
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#f4dbe1",
  },
  profileHeroImage: {
    width: "100%",
    aspectRatio: 0.88,
  },
  profileHeroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "48%",
    backgroundColor: "rgba(29, 13, 18, 0.28)",
  },
  profileHeroInfo: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
  },
  profileHeroName: {
    color: "#fff7f8",
    fontSize: 28,
    fontWeight: "900",
  },
  profileHeroMeta: {
    marginTop: 5,
    color: "#efd8de",
    fontSize: 13,
    fontWeight: "700",
  },
  matchScoreBadge: {
    position: "absolute",
    top: 18,
    right: 18,
    backgroundColor: "rgba(32, 14, 20, 0.7)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  matchScoreTop: {
    color: "#f9dce3",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  matchScoreValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  matchSummaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  matchSummaryPill: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "#fff7f8",
    borderWidth: 1,
    borderColor: "#efd7dd",
    alignItems: "center",
  },
  matchSummaryValue: {
    color: "#371922",
    fontSize: 18,
    fontWeight: "900",
  },
  matchSummaryLabel: {
    marginTop: 5,
    color: "#7c626b",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  profileBio: {
    color: "#4d3139",
    fontSize: 15,
    lineHeight: 23,
  },
  compatibilityWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    marginBottom: 14,
  },
  reasonPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#fde6dc",
  },
  reasonPillText: {
    color: "#843444",
    fontSize: 12,
    fontWeight: "700",
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#fff1f4",
    borderWidth: 1,
    borderColor: "#f0d1d9",
  },
  tagPillText: {
    color: "#6d3143",
    fontSize: 12,
    fontWeight: "700",
  },
  promptBubble: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#fff0f3",
    color: "#5a3841",
    fontSize: 14,
    lineHeight: 22,
  },
  matchGalleryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  matchGalleryImage: {
    flex: 1,
    aspectRatio: 0.8,
    borderRadius: 18,
    backgroundColor: "#f2d7de",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 10,
  },
  emptyTitle: {
    color: "#2b141a",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyCopy: {
    color: "#6c565e",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  matchList: {
    gap: 12,
  },
  chatRoster: {
    gap: 12,
  },
  chatRosterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#fff3f5",
    borderWidth: 1,
    borderColor: "#f1d7de",
  },
  chatRosterCardActive: {
    backgroundColor: "#fde8ed",
    borderColor: "#d992a5",
  },
  chatRosterAvatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#f2d7de",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#fff2f5",
  },
  matchAvatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#f2d7de",
  },
  matchCopy: {
    flex: 1,
  },
  matchName: {
    color: "#2a151b",
    fontSize: 16,
    fontWeight: "800",
  },
  matchSnippet: {
    marginTop: 4,
    color: "#705861",
    fontSize: 13,
    lineHeight: 18,
  },
  matchTime: {
    color: "#8b6a75",
    fontSize: 11,
    fontWeight: "700",
  },
  threadWrap: {
    maxHeight: 320,
    marginBottom: 12,
  },
  chatContextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#fff2f4",
  },
  chatContextAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#f1d7dd",
  },
  chatContextCopy: {
    flex: 1,
  },
  chatContextName: {
    color: "#2f151d",
    fontSize: 15,
    fontWeight: "800",
  },
  chatContextMeta: {
    marginTop: 4,
    color: "#7a5f68",
    fontSize: 12,
    lineHeight: 17,
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  messageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "#7f3043",
  },
  messageBubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "#fff0f3",
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMine: {
    color: "#fff6f7",
  },
  messageTextTheirs: {
    color: "#482c33",
  },
  messageMeta: {
    marginTop: 6,
    fontSize: 11,
  },
  messageMetaMine: {
    color: "#f0d5dc",
  },
  messageMetaTheirs: {
    color: "#8d6b76",
  },
  starterRow: {
    gap: 10,
    marginBottom: 12,
  },
  starterPill: {
    borderRadius: 16,
    backgroundColor: "#f8e1e6",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  starterPillText: {
    color: "#6c3042",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  activityHeroCard: {
    flexDirection: "row",
    gap: 10,
  },
  activityHeroMetric: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: "#fff8f8",
    borderWidth: 1,
    borderColor: "#f0d8de",
    alignItems: "center",
  },
  activityHeroValue: {
    color: "#351720",
    fontSize: 24,
    fontWeight: "900",
  },
  activityHeroLabel: {
    marginTop: 6,
    color: "#7b616b",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  activityToneCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#fff5f7",
    borderWidth: 1,
    borderColor: "#efd7de",
  },
  activityToneTitle: {
    color: "#31161e",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  activityToneCopy: {
    marginTop: 8,
    color: "#745b65",
    fontSize: 13,
    lineHeight: 19,
  },
  activityList: {
    gap: 12,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#fff2f5",
  },
  activityAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#f3d9de",
  },
  activityCopy: {
    flex: 1,
  },
  activityName: {
    color: "#271318",
    fontSize: 15,
    fontWeight: "800",
  },
  activityMeta: {
    color: "#7a5f69",
    fontSize: 12,
    marginTop: 4,
  },
  activityTime: {
    color: "#8c6b76",
    fontSize: 11,
    fontWeight: "700",
  },
  notificationList: {
    gap: 12,
  },
  notificationSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  notificationSummaryCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#fff2f5",
    alignItems: "center",
  },
  notificationSummaryValue: {
    color: "#381a23",
    fontSize: 20,
    fontWeight: "900",
  },
  notificationSummaryLabel: {
    marginTop: 5,
    color: "#7c606a",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#fff2f5",
  },
  notificationRowUnread: {
    backgroundColor: "#fde7ec",
  },
  notificationAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#f3d9de",
  },
  notificationCopy: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    color: "#291218",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  notificationUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#8f2943",
  },
  notificationBody: {
    marginTop: 5,
    color: "#6a4d57",
    fontSize: 13,
    lineHeight: 18,
  },
  notificationMeta: {
    marginTop: 7,
    color: "#8c6975",
    fontSize: 11,
    fontWeight: "700",
  },
  mutedLine: {
    color: "#766069",
    fontSize: 14,
    lineHeight: 20,
  },
  profileShowcase: {
    position: "relative",
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#f3dbe2",
  },
  profileShowcaseImage: {
    width: "100%",
    aspectRatio: 0.92,
  },
  profileShowcaseOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 18,
    backgroundColor: "rgba(28, 13, 18, 0.36)",
  },
  profileShowcaseName: {
    color: "#fff7f8",
    fontSize: 28,
    fontWeight: "900",
  },
  profileShowcaseMeta: {
    marginTop: 6,
    color: "#f2d9df",
    fontSize: 13,
    fontWeight: "700",
  },
  profileStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  profileStatCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#fff2f5",
    alignItems: "center",
  },
  profileStatValue: {
    color: "#391a23",
    fontSize: 20,
    fontWeight: "900",
  },
  profileStatLabel: {
    marginTop: 5,
    color: "#7d636c",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  profileHeaderMeta: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff0f3",
  },
  statusBadgeVerified: {
    backgroundColor: "#dff6e6",
  },
  statusBadgePending: {
    backgroundColor: "#ffe5dd",
  },
  statusBadgeText: {
    color: "#6c3244",
    fontSize: 12,
    fontWeight: "800",
  },
  appStage: {
    flex: 1,
    backgroundColor: "#05030b",
    overflow: "hidden",
  },
  appGlow: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.9,
  },
  appGlowTop: {
    width: 320,
    height: 320,
    backgroundColor: "rgba(255, 60, 145, 0.16)",
    top: -120,
    left: -80,
  },
  appGlowBottom: {
    width: 380,
    height: 380,
    backgroundColor: "rgba(255, 45, 128, 0.18)",
    bottom: -160,
    right: -120,
  },
  appBeam: {
    position: "absolute",
    top: 60,
    right: 46,
    width: 1,
    height: 280,
    backgroundColor: "rgba(255, 132, 189, 0.14)",
    transform: [{ rotate: "28deg" }],
  },
  appScroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 128,
    gap: 16,
  },
  screenHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  screenHeaderCopy: {
    flex: 1,
  },
  screenEyebrow: {
    color: "#ff92c1",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenTitle: {
    marginTop: 8,
    color: "#fff7fb",
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
  },
  screenSubtleText: {
    marginTop: 8,
    color: "rgba(255, 224, 236, 0.7)",
    fontSize: 14,
    lineHeight: 20,
  },
  screenIconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 112, 175, 0.28)",
    backgroundColor: "rgba(0,0,0,0.26)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGlassCard: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.24)",
  },
  emptyGlassTitle: {
    color: "#fff6fa",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  emptyGlassCopy: {
    marginTop: 10,
    color: "rgba(255, 225, 236, 0.76)",
    fontSize: 14,
    lineHeight: 22,
  },
  inlineActionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  secondaryOutlineButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryOutlineButtonText: {
    color: "#fff5fa",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryMiniButton: {
    flex: 1,
    borderRadius: 18,
  },
  primaryMiniButtonFill: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryMiniButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  activeFilterStrip: {
    gap: 8,
    paddingRight: 12,
  },
  activeFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 108, 176, 0.18)",
  },
  activeFilterPillText: {
    color: "#fff5fa",
    fontSize: 12,
    fontWeight: "700",
  },
  activeFilterClearPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(255, 89, 158, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 108, 176, 0.34)",
  },
  activeFilterClearText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  matchStage: {
    flex: 1,
  },
  matchScrollContent: {
    paddingBottom: 204,
  },
  matchMetricRow: {
    flexDirection: "row",
    gap: 10,
  },
  matchCardWrap: {
    position: "relative",
  },
  matchMetricPill: {
    flex: 1,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(10, 7, 19, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 98, 168, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  matchMetricValue: {
    color: "#fff6fa",
    fontSize: 15,
    fontWeight: "800",
  },
  matchMetricLabel: {
    color: "rgba(255, 219, 233, 0.64)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  matchCard: {
    height: 565,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#120914",
    borderWidth: 1,
    borderColor: "rgba(255, 95, 165, 0.2)",
    shadowColor: "#ff267b",
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  matchCardImage: {
    width: "100%",
    height: "100%",
  },
  matchCardPhotoButton: {
    flex: 1,
  },
  matchCardShade: {
    ...StyleSheet.absoluteFillObject,
  },
  matchCardTop: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  matchCardTopLeft: {
    gap: 8,
  },
  matchCardTopRight: {
    flexDirection: "row",
    gap: 8,
  },
  matchSwipeBadge: {
    position: "absolute",
    top: 92,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
  },
  matchSwipeBadgeLike: {
    right: 18,
    borderColor: "#86ffb1",
    backgroundColor: "rgba(15, 52, 32, 0.42)",
    transform: [{ rotate: "8deg" }],
  },
  matchSwipeBadgePass: {
    left: 18,
    borderColor: "#ff8abf",
    backgroundColor: "rgba(74, 16, 39, 0.42)",
    transform: [{ rotate: "-8deg" }],
  },
  matchSwipeBadgeText: {
    color: "#fffafc",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  smallStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(7, 4, 12, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  smallStatusBadgeText: {
    color: "#fff5fa",
    fontSize: 11,
    fontWeight: "700",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  liveDotActive: {
    backgroundColor: "#62ff92",
  },
  matchCardMiniAction: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 4, 12, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  matchCardBottom: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
  },
  matchCardName: {
    color: "#fff8fc",
    fontSize: 31,
    lineHeight: 34,
    fontWeight: "900",
  },
  matchCardMeta: {
    marginTop: 8,
    color: "rgba(255, 227, 238, 0.8)",
    fontSize: 14,
    fontWeight: "600",
  },
  matchCardMetaSubtle: {
    marginTop: 6,
    color: "rgba(255, 214, 230, 0.7)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  matchCardBio: {
    marginTop: 10,
    color: "rgba(255, 240, 246, 0.88)",
    fontSize: 14,
    lineHeight: 22,
  },
  matchCardReasonRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  matchReasonPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 74, 147, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 130, 185, 0.18)",
  },
  matchReasonPillText: {
    color: "#ffe8f2",
    fontSize: 11,
    fontWeight: "700",
  },
  matchInterestRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  matchInterestChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(7, 4, 12, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  matchInterestChipText: {
    color: "#fff5fa",
    fontSize: 12,
    fontWeight: "600",
  },
  matchFloatingHeart: {
    position: "absolute",
    right: 18,
    bottom: 126,
    width: 58,
    height: 58,
    borderRadius: 999,
  },
  matchFloatingHeartFill: {
    width: 58,
    height: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff2778",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  matchPrimaryActionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 16,
  },
  matchPrimaryActionButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(11, 7, 20, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  matchPrimaryActionButtonSecondary: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(23, 14, 35, 0.96)",
  },
  matchPrimaryActionButtonWrap: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  matchPrimaryActionButtonPrimary: {
    width: "100%",
    height: "100%",
    minHeight: 94,
    borderRadius: 47,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: "#ff2778",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  matchPrimaryActionText: {
    color: "#fff4fa",
    fontSize: 11,
    fontWeight: "800",
  },
  matchPrimaryActionTextPrimary: {
    color: "#fffdfd",
    fontSize: 12,
    fontWeight: "900",
  },
  matchPrimaryActionHint: {
    color: "rgba(255, 220, 233, 0.72)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  matchActionDock: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 28,
    backgroundColor: "rgba(8, 5, 14, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 104, 172, 0.18)",
    gap: 12,
    shadowColor: "#ff2b7b",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  matchUtilityRow: {
    flexDirection: "row",
    gap: 10,
  },
  matchUtilityButton: {
    flex: 1,
    minHeight: 88,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  matchUtilityButtonPrimary: {
    borderColor: "rgba(255, 104, 172, 0.34)",
    backgroundColor: "rgba(36, 10, 26, 0.86)",
  },
  matchUtilityButtonMuted: {
    opacity: 0.92,
  },
  matchUtilityIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  matchUtilityIconPrimary: {
    backgroundColor: "rgba(255, 73, 149, 0.16)",
    borderColor: "rgba(255, 112, 176, 0.28)",
  },
  matchUtilityCopy: {
    flex: 1,
  },
  matchUtilityTitle: {
    color: "#fff7fb",
    fontSize: 14,
    fontWeight: "800",
  },
  matchUtilityCaption: {
    marginTop: 4,
    color: "rgba(255, 220, 233, 0.68)",
    fontSize: 12,
    lineHeight: 17,
  },
  galleryStripScroll: {
    gap: 10,
    paddingRight: 18,
  },
  galleryStripThumb: {
    width: 108,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#1a0a18",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  galleryStripThumbActive: {
    borderColor: "rgba(255, 111, 176, 0.72)",
    shadowColor: "#ff2b7b",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  galleryStripThumbImage: {
    width: "100%",
    height: 122,
  },
  galleryStripBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(9, 5, 14, 0.92)",
  },
  galleryStripBadgeText: {
    color: "#ffe8f2",
    fontSize: 11,
    fontWeight: "700",
  },
  galleryStrip: {
    flexDirection: "row",
    gap: 10,
  },
  galleryStripImage: {
    flex: 1,
    height: 92,
    borderRadius: 18,
    backgroundColor: "#1a0a18",
  },
  infoGlassCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  infoGlassTitle: {
    color: "#fff7fb",
    fontSize: 16,
    fontWeight: "800",
  },
  infoGlassCopy: {
    marginTop: 8,
    color: "rgba(255, 227, 238, 0.8)",
    fontSize: 14,
    lineHeight: 22,
  },
  matchProfileFactGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  matchProfileFactCard: {
    width: "47.5%",
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "space-between",
  },
  matchProfileFactLabel: {
    color: "rgba(255, 208, 226, 0.6)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  matchProfileFactValue: {
    marginTop: 10,
    color: "#fff6fa",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  matchSectionTitle: {
    marginTop: 18,
    color: "#fff7fb",
    fontSize: 15,
    fontWeight: "800",
  },
  matchDetailReasonList: {
    marginTop: 10,
    gap: 10,
  },
  matchDetailReasonRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  matchDetailReasonText: {
    flex: 1,
    color: "rgba(255, 227, 238, 0.8)",
    fontSize: 14,
    lineHeight: 21,
  },
  matchActionRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    gap: 14,
  },
  matchCircleAction: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 7, 20, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  matchCircleActionPrimaryWrap: {
    borderRadius: 999,
  },
  matchCircleActionPrimary: {
    width: 74,
    height: 74,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff2376",
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  matchFooterCopy: {
    color: "rgba(255, 216, 230, 0.7)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  searchGlassBar: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 95, 165, 0.22)",
    backgroundColor: "rgba(10, 7, 19, 0.82)",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchGlassInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    minHeight: 54,
  },
  chatHeroCard: {
    overflow: "hidden",
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.22)",
    gap: 14,
  },
  chatHeroGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  chatHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  chatHeroCopy: {
    flex: 1,
    gap: 8,
  },
  chatHeroTitle: {
    color: "#fff7fb",
    fontSize: 19,
    fontWeight: "900",
  },
  chatHeroText: {
    color: "rgba(255, 227, 238, 0.8)",
    fontSize: 14,
    lineHeight: 21,
  },
  chatHeroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  chatHeroBadgeText: {
    color: "#ffddec",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  chatHeroStatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chatHeroStatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatHeroStatPillAccent: {
    backgroundColor: "rgba(255, 84, 154, 0.16)",
    borderColor: "rgba(255, 112, 175, 0.18)",
  },
  chatHeroStatText: {
    color: "rgba(255, 227, 238, 0.78)",
    fontSize: 13,
    fontWeight: "700",
  },
  chatHeroStatTextStrong: {
    color: "#fff7fb",
    fontSize: 13,
    fontWeight: "800",
  },
  chatSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatSectionTitle: {
    color: "#fff7fb",
    fontSize: 16,
    fontWeight: "800",
  },
  chatSectionMeta: {
    color: "rgba(255, 221, 234, 0.62)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chatSpotlightStrip: {
    paddingRight: 12,
    gap: 12,
  },
  chatSpotlightCard: {
    width: 92,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(11, 7, 20, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatSpotlightCardActive: {
    borderColor: "rgba(255, 111, 176, 0.48)",
    backgroundColor: "rgba(29, 12, 28, 0.9)",
  },
  chatSpotlightAvatarWrap: {
    position: "relative",
  },
  chatSpotlightAvatar: {
    width: 62,
    height: 62,
    borderRadius: 999,
  },
  chatSpotlightUnreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4f97",
    borderWidth: 2,
    borderColor: "#120712",
  },
  chatSpotlightUnreadText: {
    color: "#fffdfd",
    fontSize: 10,
    fontWeight: "900",
  },
  chatSpotlightName: {
    color: "#fff6fb",
    fontSize: 12,
    fontWeight: "800",
    maxWidth: 72,
  },
  chatSpotlightMeta: {
    color: "rgba(255, 216, 230, 0.62)",
    fontSize: 11,
    fontWeight: "700",
  },
  storyStrip: {
    paddingRight: 12,
    gap: 12,
  },
  storyAvatarCard: {
    width: 76,
    alignItems: "center",
    gap: 8,
  },
  storyAvatarCardActive: {
    transform: [{ scale: 1.02 }],
  },
  storyAvatarRing: {
    width: 72,
    height: 72,
    borderRadius: 999,
    padding: 3,
    backgroundColor: "#ff4e96",
  },
  storyAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  storyAvatarName: {
    color: "#fff4fa",
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 72,
  },
  messageListCard: {
    padding: 16,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.22)",
    gap: 12,
  },
  messageListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  messageListRowActive: {
    borderBottomColor: "rgba(255, 108, 176, 0.38)",
  },
  messageListAvatar: {
    width: 54,
    height: 54,
    borderRadius: 999,
  },
  messageListCopy: {
    flex: 1,
    gap: 4,
  },
  messageListName: {
    color: "#fff6fb",
    fontSize: 16,
    fontWeight: "800",
  },
  messageListSnippet: {
    color: "rgba(255, 221, 234, 0.68)",
    fontSize: 13,
    lineHeight: 18,
  },
  messageListMeta: {
    alignItems: "flex-end",
    gap: 6,
  },
  messageListTime: {
    color: "rgba(255, 221, 234, 0.52)",
    fontSize: 11,
    fontWeight: "700",
  },
  chatConversationStack: {
    padding: 16,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.22)",
    gap: 10,
  },
  chatConversationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  chatConversationRowActive: {
    backgroundColor: "rgba(39, 14, 31, 0.9)",
    borderColor: "rgba(255, 111, 176, 0.24)",
  },
  chatConversationAvatarWrap: {
    position: "relative",
  },
  chatConversationUnreadBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4f97",
    borderWidth: 2,
    borderColor: "#120712",
  },
  chatConversationUnreadText: {
    color: "#fffdfd",
    fontSize: 9,
    fontWeight: "900",
  },
  chatConversationTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  chatConversationCity: {
    color: "rgba(255, 216, 230, 0.5)",
    fontSize: 11,
    fontWeight: "700",
  },
  chatConversationMeta: {
    alignItems: "flex-end",
    gap: 8,
  },
  chatConversationPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatConversationPillActive: {
    backgroundColor: "rgba(255, 84, 154, 0.18)",
    borderColor: "rgba(255, 112, 175, 0.2)",
  },
  chatConversationPillText: {
    color: "#ffd7e6",
    fontSize: 11,
    fontWeight: "800",
  },
  chatConversationPillTextActive: {
    color: "#fff8fb",
  },
  messageListLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#ff5aa0",
  },
  chatHeaderBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4d96",
    borderWidth: 2,
    borderColor: "#120712",
  },
  chatHeaderBadgeText: {
    color: "#fffdfd",
    fontSize: 10,
    fontWeight: "900",
  },
  chatMessengerList: {
    gap: 10,
  },
  chatMessengerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: "rgba(10, 7, 18, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.18)",
  },
  chatMessengerAvatarWrap: {
    position: "relative",
  },
  chatMessengerAvatar: {
    width: 58,
    height: 58,
    borderRadius: 999,
  },
  chatMessengerLiveDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 999,
    backgroundColor: "#59ff95",
    borderWidth: 2,
    borderColor: "#120712",
  },
  chatMessengerCopy: {
    flex: 1,
    gap: 5,
  },
  chatMessengerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  chatMessengerName: {
    flex: 1,
    color: "#fff7fb",
    fontSize: 15,
    fontWeight: "800",
  },
  chatMessengerTime: {
    color: "rgba(255, 216, 230, 0.48)",
    fontSize: 11,
    fontWeight: "700",
  },
  chatMessengerTimeUnread: {
    color: "#ff9dc8",
  },
  chatMessengerSnippetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatMessengerSnippet: {
    flex: 1,
    color: "rgba(255, 228, 238, 0.66)",
    fontSize: 13,
    lineHeight: 18,
  },
  chatMessengerSnippetUnread: {
    color: "#fff4fa",
    fontWeight: "700",
  },
  chatMessengerUnreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4d96",
  },
  chatMessengerUnreadText: {
    color: "#fffdfd",
    fontSize: 11,
    fontWeight: "900",
  },
  chatMessengerMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  chatMessengerMeta: {
    color: "rgba(255, 216, 230, 0.5)",
    fontSize: 11,
    fontWeight: "700",
  },
  chatThreadStage: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 12,
  },
  chatThreadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chatBackButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatThreadIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chatThreadAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
  },
  chatThreadIdentityCopy: {
    flex: 1,
  },
  chatThreadName: {
    color: "#fff7fb",
    fontSize: 16,
    fontWeight: "800",
  },
  chatThreadMeta: {
    marginTop: 4,
    color: "rgba(255, 223, 235, 0.64)",
    fontSize: 12,
    fontWeight: "700",
  },
  chatThreadProfileButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatThreadStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  chatThreadStatusText: {
    color: "rgba(255, 219, 232, 0.58)",
    fontSize: 12,
    fontWeight: "700",
  },
  chatThreadMessages: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "rgba(10, 7, 18, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.18)",
    paddingHorizontal: 14,
  },
  chatThreadMessagesContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 2,
  },
  mediaMessageBubble: {
    padding: 10,
    gap: 8,
  },
  chatImageMessage: {
    width: 220,
    height: 280,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chatMediaReportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chatMediaReportText: {
    color: "#fff5fa",
    fontSize: 11,
    fontWeight: "800",
  },
  voiceMessageBubble: {
    gap: 8,
  },
  voiceMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voiceMessageIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  voiceMessageIconWrapMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  voiceMessageCopy: {
    gap: 3,
  },
  voiceMessageTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  voiceMessageDuration: {
    fontSize: 12,
    fontWeight: "700",
  },
  chatComposerDock: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  chatComposerAction: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatComposerActionRecording: {
    backgroundColor: "rgba(255, 77, 150, 0.2)",
    borderColor: "rgba(255, 108, 169, 0.34)",
  },
  chatComposerInputWrap: {
    flex: 1,
    minHeight: 54,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chatComposerInput: {
    color: "#fffdfd",
    fontSize: 15,
    lineHeight: 20,
    minHeight: 32,
    maxHeight: 96,
  },
  chatComposerSendWrap: {
    borderRadius: 999,
  },
  chatComposerSend: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  chatComposerHelperText: {
    color: "rgba(255, 216, 230, 0.56)",
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  threadCard: {
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.22)",
    overflow: "hidden",
  },
  threadHeroBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  threadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  threadHeaderProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  threadHeaderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
  },
  threadHeaderCopy: {
    flex: 1,
  },
  threadHeaderName: {
    color: "#fff7fb",
    fontSize: 16,
    fontWeight: "800",
  },
  threadHeaderMeta: {
    marginTop: 4,
    color: "rgba(255, 223, 235, 0.68)",
    fontSize: 13,
  },
  threadHeaderActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  threadStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 84, 154, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 112, 175, 0.2)",
  },
  threadStatusPillText: {
    color: "#ffe8f2",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  threadProfileButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  threadProfileButtonText: {
    color: "#fff1f8",
    fontSize: 12,
    fontWeight: "800",
  },
  threadMetricRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  threadMetricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  threadMetricPillAccent: {
    backgroundColor: "rgba(255, 84, 154, 0.16)",
    borderColor: "rgba(255, 112, 175, 0.18)",
  },
  threadMetricText: {
    color: "rgba(255, 227, 238, 0.78)",
    fontSize: 13,
    fontWeight: "700",
  },
  threadMetricTextStrong: {
    color: "#fff7fb",
    fontSize: 13,
    fontWeight: "800",
  },
  threadContextCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  threadContextLabel: {
    color: "rgba(255, 208, 226, 0.6)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  threadContextCopy: {
    color: "#fff4fa",
    fontSize: 14,
    lineHeight: 21,
  },
  threadMessages: {
    marginTop: 18,
    maxHeight: 320,
  },
  threadMessagesContent: {
    paddingBottom: 4,
  },
  threadEmptyState: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  threadEmptyTitle: {
    color: "#fff7fb",
    fontSize: 15,
    fontWeight: "800",
  },
  threadEmptyCopy: {
    color: "rgba(255, 227, 238, 0.76)",
    fontSize: 13,
    lineHeight: 20,
  },
  darkMessageBubble: {
    maxWidth: "86%",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  darkMessageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "#ff4d96",
  },
  darkMessageBubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  darkMessageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  darkMessageTextMine: {
    color: "#fff9fc",
  },
  darkMessageTextTheirs: {
    color: "#fff4fa",
  },
  darkMessageMeta: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
  },
  darkMessageMetaMine: {
    color: "rgba(255, 240, 247, 0.78)",
  },
  darkMessageMetaTheirs: {
    color: "rgba(255, 216, 230, 0.46)",
  },
  quickStarterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  quickStarterChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  quickStarterChipText: {
    color: "#fff1f8",
    fontSize: 12,
    lineHeight: 17,
  },
  quickStarterSection: {
    marginTop: 14,
    gap: 4,
  },
  quickStarterSectionTitle: {
    color: "#fff7fb",
    fontSize: 13,
    fontWeight: "800",
  },
  threadComposerShell: {
    marginTop: 16,
    padding: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  threadComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  threadComposerInput: {
    flex: 1,
    minHeight: 56,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 20,
  },
  threadSendButtonWrap: {
    borderRadius: 20,
  },
  threadSendButton: {
    width: 88,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  threadSendButtonText: {
    color: "#fffdfd",
    fontSize: 12,
    fontWeight: "800",
  },
  feedPanel: {
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  feedPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  feedPanelCopy: {
    flex: 1,
  },
  feedPanelTitle: {
    color: "#fff7fb",
    fontSize: 18,
    fontWeight: "800",
  },
  feedPanelCaption: {
    marginTop: 6,
    color: "rgba(255, 220, 233, 0.68)",
    fontSize: 13,
    lineHeight: 19,
  },
  feedPanelCount: {
    color: "#ff8fc0",
    fontSize: 18,
    fontWeight: "900",
  },
  feedPanelEmpty: {
    marginTop: 16,
    color: "rgba(255, 225, 236, 0.6)",
    fontSize: 14,
    lineHeight: 20,
  },
  feedRows: {
    marginTop: 16,
    gap: 12,
  },
  feedRowShell: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feedRowPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  feedRowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
  },
  feedRowCopy: {
    flex: 1,
    gap: 3,
  },
  feedRowName: {
    color: "#fff6fb",
    fontSize: 15,
    fontWeight: "700",
  },
  feedRowMeta: {
    color: "rgba(255, 220, 233, 0.62)",
    fontSize: 12,
  },
  feedRowTime: {
    color: "rgba(255, 220, 233, 0.46)",
    fontSize: 11,
    fontWeight: "700",
  },
  feedRowAside: {
    alignItems: "flex-end",
    gap: 5,
  },
  feedRowActionText: {
    color: "#ff91c1",
    fontSize: 11,
    fontWeight: "700",
  },
  feedRowActionWrap: {
    alignItems: "flex-end",
  },
  feedRowActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 89, 158, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 112, 175, 0.24)",
  },
  feedRowActionButtonText: {
    color: "#fff6fb",
    fontSize: 12,
    fontWeight: "800",
  },
  feedPanelHeaderActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  feedPanelHeaderButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  feedPanelHeaderButtonText: {
    color: "#fff4fa",
    fontSize: 11,
    fontWeight: "800",
  },
  notificationMiniGrid: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  notificationMiniCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationMiniValue: {
    color: "#fff8fc",
    fontSize: 20,
    fontWeight: "900",
  },
  notificationMiniLabel: {
    marginTop: 4,
    color: "rgba(255, 218, 232, 0.64)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  notificationFeedRow: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 10,
  },
  notificationFeedRowUnread: {
    borderWidth: 1,
    borderColor: "rgba(255, 95, 165, 0.18)",
  },
  notificationFeedRowPressable: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  notificationFeedAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
  },
  notificationFeedCopy: {
    flex: 1,
  },
  notificationFeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationFeedTitle: {
    color: "#fff8fc",
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  notificationFeedDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#ff5aa0",
  },
  notificationFeedBody: {
    marginTop: 4,
    color: "rgba(255, 220, 233, 0.7)",
    fontSize: 13,
    lineHeight: 18,
  },
  notificationFeedMeta: {
    marginTop: 6,
    color: "rgba(255, 220, 233, 0.46)",
    fontSize: 11,
    fontWeight: "700",
  },
  notificationFeedAction: {
    alignSelf: "center",
    color: "#ff91c1",
    fontSize: 12,
    fontWeight: "800",
  },
  notificationFeedButtonRow: {
    alignItems: "flex-end",
  },
  notificationFeedButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 89, 158, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 112, 175, 0.24)",
  },
  notificationFeedButtonText: {
    color: "#fff6fb",
    fontSize: 12,
    fontWeight: "800",
  },
  discoveryHeroCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 26,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
    overflow: "hidden",
  },
  discoveryHeroOrb: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(255, 41, 121, 0.16)",
  },
  discoveryHeroRing: {
    width: 200,
    height: 200,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(255, 76, 152, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    gap: 8,
  },
  discoveryHeroTitle: {
    color: "#fff8fc",
    fontSize: 24,
    fontWeight: "800",
  },
  discoveryHeroCopy: {
    color: "rgba(255, 223, 235, 0.76)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  discoveryMiniRow: {
    flexDirection: "row",
    gap: 10,
  },
  discoveryMiniCard: {
    flex: 1,
    minHeight: 128,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(11, 7, 20, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  discoveryMiniTitle: {
    marginTop: 12,
    color: "#fff7fb",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  discoveryMiniValue: {
    marginTop: 8,
    color: "#ff9bc8",
    fontSize: 24,
    fontWeight: "900",
  },
  recentPulseCard: {
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(11, 7, 20, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  recentPulseTitle: {
    color: "#fff8fc",
    fontSize: 16,
    fontWeight: "800",
  },
  recentPulseStrip: {
    marginTop: 14,
    gap: 12,
    paddingRight: 12,
  },
  recentPulseAvatarWrap: {
    width: 62,
    alignItems: "center",
    gap: 8,
  },
  recentPulseAvatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
  },
  recentPulseName: {
    color: "#fff0f8",
    fontSize: 11,
    textAlign: "center",
  },
  activityTabStrip: {
    gap: 8,
    paddingRight: 12,
  },
  activityTabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  activityTabPillActive: {
    backgroundColor: "rgba(255, 89, 158, 0.16)",
    borderColor: "rgba(255, 108, 176, 0.32)",
  },
  activityTabPillText: {
    color: "#fff1f8",
    fontSize: 13,
    fontWeight: "700",
  },
  activityTabPillTextActive: {
    color: "#ffffff",
  },
  activityTabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  activityTabCountActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  activityTabCountText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
  },
  activityTabCountTextActive: {
    color: "#ffffff",
  },
  profileHeroCardDark: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 24,
    borderRadius: 32,
    backgroundColor: "rgba(11, 7, 20, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.22)",
    alignItems: "center",
    overflow: "hidden",
  },
  profileAvatarRing: {
    width: 150,
    height: 150,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255, 93, 160, 0.28)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  profileAvatarDark: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  profileHeroNameDark: {
    marginTop: 16,
    color: "#fff7fb",
    fontSize: 28,
    fontWeight: "900",
  },
  profileHeroMetaDark: {
    marginTop: 8,
    color: "rgba(255, 223, 235, 0.76)",
    fontSize: 14,
    textAlign: "center",
  },
  profileHeroMetaSubtle: {
    marginTop: 6,
    color: "rgba(255, 211, 227, 0.62)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  profileBadgeRowDark: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  profileBadgeDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profileBadgeDarkText: {
    color: "#fff4fa",
    fontSize: 12,
    fontWeight: "700",
  },
  profileMetricGridDark: {
    width: "100%",
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  profileMetricCardDark: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileMetricValueDark: {
    color: "#fff8fc",
    fontSize: 24,
    fontWeight: "900",
  },
  profileMetricLabelDark: {
    marginTop: 6,
    color: "rgba(255, 220, 233, 0.64)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  profileBodyCopyDark: {
    marginTop: 16,
    color: "rgba(255, 226, 237, 0.82)",
    fontSize: 14,
    lineHeight: 22,
  },
  profilePromptCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profilePromptLabel: {
    color: "#ff9bc8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  profilePromptLabelSpaced: {
    marginTop: 14,
  },
  profilePromptText: {
    marginTop: 8,
    color: "#fff3f9",
    fontSize: 14,
    lineHeight: 20,
  },
  profileDarkChipRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  profileDarkChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profileDarkChipText: {
    color: "#fff4fa",
    fontSize: 12,
    fontWeight: "600",
  },
  profileDarkPhotoRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profilePhotoPreviewCard: {
    marginTop: 16,
    height: 280,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  profilePhotoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  profileDarkPhotoSlot: {
    width: "31%",
    aspectRatio: 0.88,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  profileDarkPhotoSlotActive: {
    borderWidth: 2,
    borderColor: "#ff5aa0",
  },
  profileDarkPhotoSlotHero: {
    width: "100%",
    aspectRatio: 1.14,
  },
  profileDarkPhotoImage: {
    width: "100%",
    height: "100%",
  },
  profileDarkPhotoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  profileDarkPhotoPlaceholderText: {
    color: "rgba(255, 220, 233, 0.54)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  profileActionStackDark: {
    gap: 12,
  },
  profileMiniMetricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  profileMiniMetricCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "rgba(11, 7, 20, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.2)",
  },
  profileMiniMetricValue: {
    color: "#fff7fb",
    fontSize: 24,
    fontWeight: "900",
  },
  profileMiniMetricLabel: {
    marginTop: 8,
    color: "rgba(255, 220, 233, 0.64)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  accountStatusGrid: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  accountStatusCard: {
    flex: 1,
    minHeight: 90,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  accountStatusValue: {
    color: "#fff8fc",
    fontSize: 20,
    fontWeight: "900",
  },
  accountStatusLabel: {
    marginTop: 8,
    color: "rgba(255, 220, 233, 0.64)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  betaChecklist: {
    marginTop: 16,
    gap: 12,
  },
  betaChecklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  betaChecklistText: {
    flex: 1,
    color: "#fff5fa",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  primaryWideButtonWrap: {
    borderRadius: 22,
  },
  primaryWideButton: {
    minHeight: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryWideButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryWideButton: {
    minHeight: 56,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 18,
  },
  secondaryWideButtonText: {
    color: "#fff5fa",
    fontSize: 15,
    fontWeight: "700",
  },
  ghostWideButton: {
    minHeight: 56,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.26)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 18,
  },
  ghostWideButtonText: {
    color: "#ffd7e6",
    fontSize: 15,
    fontWeight: "700",
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  filterOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,1,6,0.72)",
  },
  filterSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 22,
    backgroundColor: "#0b0713",
    borderTopWidth: 1,
    borderColor: "rgba(255, 97, 167, 0.22)",
    gap: 14,
  },
  directMessageSheet: {
    marginTop: "auto",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 22,
    backgroundColor: "#0b0713",
    borderTopWidth: 1,
    borderColor: "rgba(255, 97, 167, 0.22)",
    gap: 16,
  },
  filterSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  directMessageHeaderCopy: {
    flex: 1,
    gap: 6,
    paddingRight: 12,
  },
  directMessageMeta: {
    color: "rgba(255, 221, 234, 0.72)",
    fontSize: 13,
    lineHeight: 18,
  },
  directMessageProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  directMessageAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
  },
  directMessageProfileCopy: {
    flex: 1,
    gap: 4,
  },
  directMessageProfileName: {
    color: "#fff6fb",
    fontSize: 17,
    fontWeight: "800",
  },
  directMessageProfileMeta: {
    color: "rgba(255, 221, 234, 0.68)",
    fontSize: 13,
    lineHeight: 18,
  },
  directMessageInput: {
    minHeight: 138,
  },
  directMessageHelper: {
    color: "rgba(255, 221, 234, 0.68)",
    fontSize: 12,
    lineHeight: 18,
  },
  directMessageActions: {
    flexDirection: "row",
    gap: 10,
  },
  filterMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  filterMetaText: {
    flex: 1,
    color: "rgba(255, 221, 234, 0.72)",
    fontSize: 13,
    lineHeight: 18,
  },
  filterResetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterResetButtonText: {
    color: "#ffd8e7",
    fontSize: 12,
    fontWeight: "700",
  },
  filterSheetTitle: {
    color: "#fff7fb",
    fontSize: 24,
    fontWeight: "900",
  },
  filterCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  filterSectionLabel: {
    color: "#ffd4e3",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  radiusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  radiusChipActive: {
    backgroundColor: "rgba(255, 89, 158, 0.18)",
    borderColor: "rgba(255, 110, 176, 0.4)",
  },
  radiusChipText: {
    color: "#fff1f8",
    fontSize: 13,
    fontWeight: "700",
  },
  radiusChipTextActive: {
    color: "#ffffff",
  },
  ageRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ageRangeInput: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#ffffff",
    fontSize: 15,
    paddingHorizontal: 16,
  },
  ageRangeDivider: {
    width: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  filterChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterInterestChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterInterestChipActive: {
    backgroundColor: "rgba(255, 89, 158, 0.18)",
    borderColor: "rgba(255, 110, 176, 0.4)",
  },
  filterInterestChipText: {
    color: "#fff1f8",
    fontSize: 13,
    fontWeight: "700",
  },
  filterInterestChipTextActive: {
    color: "#ffffff",
  },
  preferenceStack: {
    gap: 10,
  },
  preferenceRow: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preferenceLabel: {
    color: "#fff4fa",
    fontSize: 14,
    fontWeight: "600",
  },
  preferenceToggle: {
    width: 46,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 3,
    justifyContent: "center",
  },
  preferenceToggleActive: {
    backgroundColor: "#ff4f96",
  },
  preferenceToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  preferenceToggleThumbActive: {
    alignSelf: "flex-end",
  },
  appNoticeToast: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 104,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(16, 9, 25, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 89, 158, 0.24)",
  },
  appNoticeToastText: {
    color: "#fff1f7",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  bottomNavDark: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8, 5, 14, 0.96)",
  },
  bottomNavDarkItem: {
    alignItems: "center",
    gap: 6,
    minWidth: 72,
  },
  bottomNavDarkIconWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavDarkBadge: {
    position: "absolute",
    top: -2,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4f96",
  },
  bottomNavDarkBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  matchPhotoViewerCard: {
    marginHorizontal: 18,
    marginBottom: Platform.OS === "ios" ? 30 : 18,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#120914",
    borderWidth: 1,
    borderColor: "rgba(255, 95, 165, 0.24)",
    shadowColor: "#ff267b",
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  matchPhotoViewerImage: {
    width: "100%",
    aspectRatio: 0.78,
  },
  matchPhotoViewerShade: {
    ...StyleSheet.absoluteFillObject,
  },
  matchPhotoViewerHeader: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  matchPhotoViewerCopy: {
    flex: 1,
  },
  matchPhotoViewerTitle: {
    color: "#fff8fc",
    fontSize: 24,
    fontWeight: "900",
  },
  matchPhotoViewerMeta: {
    marginTop: 6,
    color: "rgba(255, 227, 238, 0.78)",
    fontSize: 13,
    fontWeight: "600",
  },
  matchPhotoViewerCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 4, 12, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  matchPhotoViewerNav: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchPhotoViewerNavButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 4, 12, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bottomNavDarkText: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 11,
    fontWeight: "700",
  },
  bottomNavDarkTextActive: {
    color: "#ff7cb6",
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 22 : 14,
    borderTopWidth: 1,
    borderTopColor: "#eed4db",
    backgroundColor: "rgba(255, 249, 250, 0.98)",
  },
  bottomNavItem: {
    alignItems: "center",
    gap: 7,
    minWidth: 70,
  },
  bottomNavLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bottomNavDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#d8bcc5",
  },
  bottomNavDotActive: {
    backgroundColor: "#7f3043",
    transform: [{ scale: 1.2 }],
  },
  bottomNavText: {
    color: "#8b6c77",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomNavTextActive: {
    color: "#6d2f41",
  },
  bottomNavBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8f2943",
  },
  bottomNavBadgeText: {
    color: "#fff7f8",
    fontSize: 10,
    fontWeight: "800",
  },
  noticeBar: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: -4,
    borderRadius: 16,
    backgroundColor: "#fff0d9",
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 4,
  },
  noticeText: {
    color: "#6d4b26",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
