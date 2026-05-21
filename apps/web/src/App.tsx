import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest, getApiUrl } from "./api";
import type {
  AdminMetrics,
  AuthResponse,
  DiscoverResponse,
  InteractionResponse,
  LaunchConfig,
  MatchListResponse,
  MatchMessage,
  MessageResponse,
  PublicProfile,
  SessionPayload,
} from "./types";

type ViewMode = "landing" | "product" | "admin";
type ProductTab = "discover" | "matches" | "profile";
type AuthMode = "login" | "register";

type ProfileDraft = {
  displayName: string;
  bio: string;
  city: string;
  intention: string;
  interests: string;
  photos: string;
  prompts: string;
  values: string;
  lifestyle: string;
};

const TOKEN_STORAGE_KEY = "datecite.web.token";
const ADMIN_TOKEN_STORAGE_KEY = "datecite.web.adminToken";

const defaultConfig: LaunchConfig = {
  brand: {
    name: "DateCite",
    tagline: "Conoce con intencion.",
    heroTitle: "La app de citas seria para Latam que no te cobra por lo minimo.",
    heroSubtitle:
      "Menos swipe vacio, mas compatibilidad real. En free puedes descubrir, hacer match, chatear, reportar y bloquear.",
  },
  market: {
    region: "Latam",
    language: "es",
    positioning: "Relaciones serias con monetizacion etica.",
  },
  promise: {
    headline: "El plan gratuito se siente completo.",
    bullets: [],
  },
  features: [],
  freePlan: {
    name: "Free",
    monthlyPrice: "0",
    dailyLikeLimit: 12,
    dailyDirectMessageLimit: 10,
    weeklyBoosts: 1,
    features: [],
  },
  plusPlan: {
    name: "Plus",
    monthlyPrice: "9.99",
    dailyLikeLimit: null,
    dailyDirectMessageLimit: null,
    weeklyBoosts: 5,
    features: [],
  },
  safety: {
    title: "Seguridad",
    items: [],
  },
};

function readStorage(key: string, fallback = "") {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

function removeStorage(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value: string[]) {
  return value.join(", ");
}

function buildProfileDraft(session?: SessionPayload | AuthResponse | null): ProfileDraft {
  return {
    displayName: session?.profile.displayName ?? "",
    bio: session?.profile.bio ?? "",
    city: session?.profile.city ?? "",
    intention: session?.profile.intention ?? "relacion-seria",
    interests: joinList(session?.profile.interests ?? []),
    photos: joinList(session?.profile.photos ?? []),
    prompts: joinList(session?.profile.prompts ?? []),
    values: joinList(session?.profile.values ?? []),
    lifestyle: joinList(session?.profile.lifestyle ?? []),
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin actividad todavia";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("es-419", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildStarterMessages(profile: PublicProfile | null) {
  if (!profile) {
    return [];
  }

  const starters: string[] = [];

  if (profile.prompts[0]) {
    starters.push(`Me gusto esto que dijiste: "${profile.prompts[0]}"`);
  }

  if (profile.compatibilityReasons[0]) {
    starters.push(`Creo que conectamos por ${profile.compatibilityReasons[0].toLowerCase()}.`);
  }

  starters.push("Si te parece, podemos pasar de la app a un cafe esta semana.");

  return starters.slice(0, 3);
}

export default function App() {
  const [config, setConfig] = useState<LaunchConfig>(defaultConfig);
  const [viewMode, setViewMode] = useState<ViewMode>("landing");
  const [productTab, setProductTab] = useState<ProductTab>("discover");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [waitlistForm, setWaitlistForm] = useState({
    name: "",
    email: "",
    city: "",
    note: "",
  });
  const [authForm, setAuthForm] = useState({
    email: "mateo@datecite.app",
    password: "DateCiteDemo123!",
    fullName: "",
    displayName: "",
    birthDate: "1998-05-18",
    city: "Bogota",
  });
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(buildProfileDraft(null));
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null);
  const [matches, setMatches] = useState<MatchListResponse["matches"]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [messagesByMatchId, setMessagesByMatchId] = useState<Record<number, MatchMessage[]>>({});
  const [messageDraft, setMessageDraft] = useState("");
  const [reportForm, setReportForm] = useState({
    reason: "perfil-sospechoso",
    details: "",
  });
  const [adminToken, setAdminToken] = useState(() => readStorage(ADMIN_TOKEN_STORAGE_KEY, "datecite-admin-token"));
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null);

  const currentCandidate = discover?.profiles[0] ?? null;
  const nextCandidates = discover?.profiles.slice(1, 4) ?? [];
  const activeMatch = matches.find((item) => item.id === selectedMatchId) ?? null;
  const activeMessages = activeMatch ? messagesByMatchId[activeMatch.id] ?? [] : [];
  const starterMessages = useMemo(() => buildStarterMessages(activeMatch?.otherUser ?? null), [activeMatch]);
  const profileIsLocked = Boolean(session && !session.profile.onboardingCompleted);
  const likesCopy =
    discover?.likesRemaining === null
      ? "Likes sin limite"
      : `${discover?.likesRemaining ?? config.freePlan.dailyLikeLimit} likes hoy`;

  useEffect(() => {
    apiRequest<LaunchConfig>("/api/launch-config")
      .then(setConfig)
      .catch((error: Error) => {
        setNotice(error.message);
      });
  }, []);

  useEffect(() => {
    writeStorage(ADMIN_TOKEN_STORAGE_KEY, adminToken);
  }, [adminToken]);

  useEffect(() => {
    const storedToken = readStorage(TOKEN_STORAGE_KEY);

    if (!storedToken) {
      setBooting(false);
      return;
    }

    void resumeSession(storedToken);
  }, []);

  useEffect(() => {
    if (!session?.token || !selectedMatchId) {
      return;
    }

    void fetchMessages(selectedMatchId, session.token, true);
    const timer = window.setInterval(() => {
      void fetchMessages(selectedMatchId, session.token, true);
    }, 7000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedMatchId, session?.token]);

  async function resumeSession(token: string) {
    setBooting(true);

    try {
      const me = await apiRequest<SessionPayload>("/api/auth/me", { token });
      const nextSession = { ...me, token };
      setSession(nextSession);
      setProfileDraft(buildProfileDraft(nextSession));
      setProductTab(nextSession.profile.onboardingCompleted ? "discover" : "profile");
      setViewMode("product");
      await refreshProductState(token, null);
    } catch (error) {
      removeStorage(TOKEN_STORAGE_KEY);
      setNotice(error instanceof Error ? error.message : "No pudimos restaurar tu sesion.");
    } finally {
      setBooting(false);
    }
  }

  function commitSession(payload: AuthResponse) {
    setSession(payload);
    setProfileDraft(buildProfileDraft(payload));
    writeStorage(TOKEN_STORAGE_KEY, payload.token);
    setProductTab(payload.profile.onboardingCompleted ? "discover" : "profile");
    setViewMode("product");
  }

  function clearSession() {
    setSession(null);
    setDiscover(null);
    setMatches([]);
    setMessagesByMatchId({});
    setSelectedMatchId(null);
    setMessageDraft("");
    removeStorage(TOKEN_STORAGE_KEY);
    setViewMode("landing");
    setNotice("Sesion cerrada.");
  }

  async function refreshProductState(token: string, preferredMatchId: number | null) {
    const [discoverPayload, matchesPayload] = await Promise.all([
      apiRequest<DiscoverResponse>("/api/discover", { token }),
      apiRequest<MatchListResponse>("/api/matches", { token }),
    ]);

    setDiscover(discoverPayload);
    setMatches(matchesPayload.matches);
    setSelectedMatchId((current) => {
      const candidateId = preferredMatchId ?? current;
      if (candidateId && matchesPayload.matches.some((item) => item.id === candidateId)) {
        return candidateId;
      }

      return matchesPayload.matches[0]?.id ?? null;
    });
  }

  async function fetchMessages(matchId: number, token: string, silent = false) {
    try {
      const response = await apiRequest<MessageResponse>(`/api/matches/${matchId}/messages`, { token });
      setMessagesByMatchId((current) => ({
        ...current,
        [matchId]: response.messages,
      }));
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "No pudimos cargar la conversacion.");
      }
    }
  }

  async function handleWaitlistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("waitlist");
    setNotice(null);

    try {
      await apiRequest("/api/waitlist", {
        method: "POST",
        body: waitlistForm,
      });

      setWaitlistForm({
        name: "",
        email: "",
        city: "",
        note: "",
      });
      setNotice("Lead guardado. Ya puedes medir interes real desde la web.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar el lead.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("auth");
    setNotice(null);

    try {
      const payload =
        authMode === "login"
          ? await apiRequest<AuthResponse>("/api/auth/login", {
              method: "POST",
              body: {
                email: authForm.email,
                password: authForm.password,
              },
            })
          : await apiRequest<AuthResponse>("/api/auth/register", {
              method: "POST",
              body: {
                email: authForm.email,
                password: authForm.password,
                fullName: authForm.fullName,
                displayName: authForm.displayName || authForm.fullName,
                birthDate: authForm.birthDate,
                city: authForm.city,
              },
            });

      commitSession(payload);
      await refreshProductState(payload.token, null);
      setNotice(authMode === "login" ? "Sesion iniciada." : "Cuenta creada. Completa tu perfil.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos abrir tu sesion.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setBusyKey("profile");
    setNotice(null);

    try {
      const payload = await apiRequest<SessionPayload>("/api/profile", {
        method: "PUT",
        token: session.token,
        body: {
          displayName: profileDraft.displayName,
          bio: profileDraft.bio,
          city: profileDraft.city,
          intention: profileDraft.intention,
          interests: splitCommaList(profileDraft.interests),
          photos: splitCommaList(profileDraft.photos),
          prompts: splitCommaList(profileDraft.prompts),
          values: splitCommaList(profileDraft.values),
          lifestyle: splitCommaList(profileDraft.lifestyle),
        },
      });

      const nextSession = { ...payload, token: session.token };
      setSession(nextSession);
      setProfileDraft(buildProfileDraft(nextSession));
      setProductTab(nextSession.profile.onboardingCompleted ? productTab : "profile");
      await refreshProductState(session.token, selectedMatchId);
      setNotice(
        nextSession.profile.onboardingCompleted
          ? "Perfil guardado. Tu cuenta ya esta lista para descubrir personas."
          : "Aun te falta bio, 2 intereses, 1 foto y 1 prompt para abrir Discover.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar tu perfil.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInteraction(action: "like" | "pass") {
    if (!session || !currentCandidate) {
      return;
    }

    setBusyKey(`interaction-${action}`);
    setNotice(null);

    try {
      const result = await apiRequest<InteractionResponse>("/api/interactions", {
        method: "POST",
        token: session.token,
        body: {
          targetProfileId: currentCandidate.userId,
          action,
        },
      });

      await refreshProductState(session.token, result.matchId);

      if (result.newMatch && result.matchId) {
        setProductTab("matches");
        setSelectedMatchId(result.matchId);
        setNotice(`Hubo match con ${currentCandidate.displayName}. El chat ya esta abierto.`);
      } else if (action === "like") {
        setNotice("Interes guardado.");
      } else {
        setNotice("Perfil descartado.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos registrar tu decision.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReport() {
    if (!session || !currentCandidate) {
      return;
    }

    setBusyKey("report");
    setNotice(null);

    try {
      await apiRequest("/api/reports", {
        method: "POST",
        token: session.token,
        body: {
          targetUserId: currentCandidate.userId,
          reason: reportForm.reason,
          details: reportForm.details,
        },
      });
      setReportForm((current) => ({
        ...current,
        details: "",
      }));
      setNotice("Reporte enviado. El equipo podra revisarlo.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos enviar el reporte.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBlock() {
    if (!session || !currentCandidate) {
      return;
    }

    const confirmed = window.confirm(`Bloquear a ${currentCandidate.displayName}? Desaparecera de tu experiencia.`);
    if (!confirmed) {
      return;
    }

    setBusyKey("block");
    setNotice(null);

    try {
      await apiRequest("/api/blocks", {
        method: "POST",
        token: session.token,
        body: {
          targetUserId: currentCandidate.userId,
        },
      });

      await refreshProductState(session.token, selectedMatchId);
      setNotice(`${currentCandidate.displayName} fue bloqueado.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos bloquear este perfil.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !activeMatch || !messageDraft.trim()) {
      return;
    }

    setBusyKey("message");
    setNotice(null);

    try {
      const response = await apiRequest<MessageResponse>(`/api/matches/${activeMatch.id}/messages`, {
        method: "POST",
        token: session.token,
        body: {
          content: messageDraft.trim(),
        },
      });

      setMessagesByMatchId((current) => ({
        ...current,
        [activeMatch.id]: response.messages,
      }));
      setMessageDraft("");
      await refreshProductState(session.token, activeMatch.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos enviar el mensaje.");
    } finally {
      setBusyKey(null);
    }
  }

  async function loadAdminMetrics() {
    setBusyKey("admin");
    setNotice(null);

    try {
      const metrics = await apiRequest<AdminMetrics>("/api/admin/metrics", {
        headers: {
          "x-admin-token": adminToken,
        },
      });

      setAdminMetrics(metrics);
      setNotice("Panel de control actualizado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos cargar el panel admin.");
    } finally {
      setBusyKey(null);
    }
  }

  if (booting) {
    return (
      <div className="site-shell loading-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <div className="loading-card panel">
          <p className="kicker">DateCite</p>
          <h1>Reconectando tu espacio.</h1>
          <p>Estamos restaurando la sesion, el discover y tus conversaciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <header className="topbar panel">
        <div className="brand-lockup">
          <p className="kicker">{config.brand.name}</p>
          <h1>{config.brand.tagline}</h1>
          <span className="brand-subtitle">{config.market.positioning}</span>
        </div>

        <nav className="mode-nav">
          <button
            className={`nav-pill ${viewMode === "landing" ? "is-active" : ""}`}
            type="button"
            onClick={() => setViewMode("landing")}
          >
            Inicio
          </button>
          <button
            className={`nav-pill ${viewMode === "product" ? "is-active" : ""}`}
            type="button"
            onClick={() => setViewMode(session ? "product" : "landing")}
          >
            Producto
          </button>
          <button
            className={`nav-pill ${viewMode === "admin" ? "is-active" : ""}`}
            type="button"
            onClick={() => setViewMode("admin")}
          >
            Control
          </button>
        </nav>

        <div className="topbar-actions">
          <span className="status-badge">{session ? likesCopy : "Soft launch listo"}</span>
          {session ? (
            <button className="ghost-button" type="button" onClick={clearSession}>
              Salir
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => setViewMode("landing")}>
              Probar demo
            </button>
          )}
        </div>
      </header>

      {notice ? <div className="notice-bar panel">{notice}</div> : null}

      {viewMode === "landing" ? (
        <main className="landing-flow">
          <section className="hero-grid">
            <article className="hero-stage panel">
              <div className="hero-copy">
                <span className="spot-pill">Signal-first dating</span>
                <h2>{config.brand.heroTitle}</h2>
                <p>{config.brand.heroSubtitle}</p>

                <div className="hero-actions">
                  <button className="primary-button" type="button" onClick={() => setViewMode(session ? "product" : "landing")}>
                    {session ? "Entrar al producto" : "Entrar con demo"}
                  </button>
                  <a className="ghost-button" href="#waitlist">
                    Captar usuarios
                  </a>
                </div>
              </div>

              <div className="hero-orbit">
                <div className="orbit-core">
                  <span className="orbit-label">Free</span>
                  <strong>{config.freePlan.dailyLikeLimit}</strong>
                  <small>likes con chat libre</small>
                </div>
                <div className="orbit-ring orbit-ring-one" />
                <div className="orbit-ring orbit-ring-two" />
                <div className="orbit-card orbit-card-top">
                  <span>Promesa</span>
                  <strong>Sin paywalls toxicos</strong>
                </div>
                <div className="orbit-card orbit-card-bottom">
                  <span>Enfoque</span>
                  <strong>Relaciones con intencion</strong>
                </div>
              </div>
            </article>

            <aside className="auth-stage panel">
              <div className="auth-head">
                <p className="kicker">Acceso</p>
                <h3>{authMode === "login" ? "Entra al MVP ahora" : "Crea una cuenta real"}</h3>
                <p>
                  El cliente web ya usa la API completa: auth, discover, matches, chat, reportes y perfil.
                </p>
              </div>

              <div className="auth-switch">
                <button
                  type="button"
                  className={`micro-pill ${authMode === "login" ? "is-active" : ""}`}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`micro-pill ${authMode === "register" ? "is-active" : ""}`}
                  onClick={() => setAuthMode("register")}
                >
                  Registro
                </button>
              </div>

              <form className="stack-form" onSubmit={handleAuthSubmit}>
                <input
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Correo"
                  type="email"
                />
                <input
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Contrasena"
                  type="password"
                />

                {authMode === "register" ? (
                  <>
                    <input
                      value={authForm.fullName}
                      onChange={(event) => setAuthForm((current) => ({ ...current, fullName: event.target.value }))}
                      placeholder="Nombre completo"
                    />
                    <input
                      value={authForm.displayName}
                      onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="Nombre visible"
                    />
                    <input
                      value={authForm.birthDate}
                      onChange={(event) => setAuthForm((current) => ({ ...current, birthDate: event.target.value }))}
                      placeholder="Nacimiento YYYY-MM-DD"
                    />
                    <input
                      value={authForm.city}
                      onChange={(event) => setAuthForm((current) => ({ ...current, city: event.target.value }))}
                      placeholder="Ciudad"
                    />
                  </>
                ) : null}

                <button className="primary-button" type="submit" disabled={busyKey === "auth"}>
                  {busyKey === "auth" ? "Procesando..." : authMode === "login" ? "Abrir sesion" : "Crear cuenta"}
                </button>
              </form>

              <div className="demo-note">
                <strong>Demo lista:</strong> `mateo@datecite.app` / `DateCiteDemo123!`
              </div>
            </aside>
          </section>

          <section className="promise-ribbon panel">
            <div>
              <p className="kicker">Promesa central</p>
              <h3>{config.promise.headline}</h3>
            </div>

            <div className="promise-grid">
              {config.promise.bullets.map((item) => (
                <article key={item} className="mini-panel">
                  {item}
                </article>
              ))}
            </div>
          </section>

          <section className="feature-shelf">
            {config.features.map((feature) => (
              <article key={feature.title} className="feature-card panel">
                <p className="kicker">Sistema</p>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}

            <article className="feature-card panel">
              <p className="kicker">Modelo</p>
              <h3>Free util, Plus acelerado</h3>
              <p>
                El usuario gratuito puede crear perfil, descubrir, hacer match, chatear, reportar y bloquear.
              </p>
            </article>

            <article className="feature-card panel">
              <p className="kicker">Tono</p>
              <h3>Menos juego, mas señal</h3>
              <p>
                La interfaz empuja perfil, compatibilidad y conversacion; no solo imagen ni loops de dopamina.
              </p>
            </article>
          </section>

          <section className="launch-grid">
            <article id="waitlist" className="panel waitlist-stage">
              <div className="section-head">
                <p className="kicker">Captacion</p>
                <h3>Recoge demanda hoy mismo.</h3>
                <p>
                  Puedes validar ciudades, tono de usuarios y mensajes de valor antes de escalar pagos o moderacion.
                </p>
              </div>

              <form className="stack-form" onSubmit={handleWaitlistSubmit}>
                <input
                  value={waitlistForm.name}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nombre"
                />
                <input
                  value={waitlistForm.email}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Correo"
                  type="email"
                />
                <input
                  value={waitlistForm.city}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, city: event.target.value }))}
                  placeholder="Ciudad"
                />
                <textarea
                  value={waitlistForm.note}
                  onChange={(event) => setWaitlistForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Que busca o por que le interesa"
                />
                <button className="primary-button" type="submit" disabled={busyKey === "waitlist"}>
                  {busyKey === "waitlist" ? "Guardando..." : "Guardar lead"}
                </button>
              </form>
            </article>

            <article className="panel ritual-stage">
              <div className="section-head">
                <p className="kicker">Experiencia</p>
                <h3>Una atmosfera mas adulta que una app de swipe normal.</h3>
              </div>

              <div className="ritual-list">
                <div className="ritual-item">
                  <span>01</span>
                  <div>
                    <strong>Signal profile</strong>
                    <p>Bio, prompts, valores y estilo de vida antes del juego visual.</p>
                  </div>
                </div>
                <div className="ritual-item">
                  <span>02</span>
                  <div>
                    <strong>Curacion limitada</strong>
                    <p>Menos perfiles, pero mejor priorizados por intencion y afinidad real.</p>
                  </div>
                </div>
                <div className="ritual-item">
                  <span>03</span>
                  <div>
                    <strong>Chat abierto</strong>
                    <p>Si hubo match, la conversacion no queda secuestrada por un paywall.</p>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </main>
      ) : null}

      {viewMode === "product" ? (
        <main className="product-flow">
          {!session ? (
            <section className="panel empty-stage">
              <p className="kicker">Sin sesion</p>
              <h2>Abre el producto desde la cuenta demo o crea una nueva.</h2>
              <p>La experiencia completa vive dentro de este cliente web y ya esta conectada a la API.</p>
            </section>
          ) : (
            <>
              <section className="overview-grid">
                <article className="metric-card panel">
                  <span>Plan</span>
                  <strong>{session.user.plan.toUpperCase()}</strong>
                  <small>{session.profile.isVerified ? "Perfil verificado" : "Verificacion reservada para fase 2"}</small>
                </article>
                <article className="metric-card panel">
                  <span>Hoy</span>
                  <strong>{likesCopy}</strong>
                  <small>{discover?.likesUsed ?? 0} usados en esta sesion diaria</small>
                </article>
                <article className="metric-card panel">
                  <span>Matches</span>
                  <strong>{matches.length}</strong>
                  <small>Chat libre entre perfiles compatibles</small>
                </article>
                <article className="metric-card panel">
                  <span>API</span>
                  <strong>Live</strong>
                  <small>{getApiUrl()}</small>
                </article>
              </section>

              <section className="workspace">
                <aside className="workspace-rail">
                  <article className="panel account-panel">
                    <p className="kicker">Tu cuenta</p>
                    <h3>{session.profile.displayName || session.user.fullName}</h3>
                    <p>
                      {session.user.age} anos · {session.profile.city}
                    </p>
                    <div className="chip-row">
                      <span className="chip">{session.profile.intention}</span>
                      <span className="chip">{session.user.plan}</span>
                      {session.profile.isVerified ? <span className="chip">verificado</span> : null}
                    </div>
                  </article>

                  <article className="panel tab-panel">
                    <p className="kicker">Workspace</p>
                    <div className="tab-stack">
                      <button
                        type="button"
                        className={`stack-tab ${productTab === "discover" ? "is-active" : ""}`}
                        onClick={() => setProductTab("discover")}
                      >
                        Discover
                      </button>
                      <button
                        type="button"
                        className={`stack-tab ${productTab === "matches" ? "is-active" : ""}`}
                        onClick={() => setProductTab("matches")}
                      >
                        Matches
                      </button>
                      <button
                        type="button"
                        className={`stack-tab ${productTab === "profile" ? "is-active" : ""}`}
                        onClick={() => setProductTab("profile")}
                      >
                        Perfil
                      </button>
                    </div>
                  </article>

                  <article className="panel plan-panel">
                    <p className="kicker">Free vs Plus</p>
                    <h3>El pago acelera, no encierra.</h3>
                    <ul className="bullet-list">
                      <li>{config.freePlan.dailyLikeLimit} likes diarios para free.</li>
                      <li>Chat sin limite una vez existe el match.</li>
                      <li>${config.plusPlan.monthlyPrice}/mes para alcance y filtros avanzados.</li>
                    </ul>
                  </article>

                  {nextCandidates.length > 0 ? (
                    <article className="panel queue-panel">
                      <p className="kicker">Siguiente cola</p>
                      {nextCandidates.map((profile) => (
                        <div key={profile.userId} className="queue-item">
                          <strong>{profile.displayName}</strong>
                          <span>{profile.compatibilityScore}% de afinidad</span>
                        </div>
                      ))}
                    </article>
                  ) : null}
                </aside>

                <section className="workspace-stage">
                  {productTab === "discover" ? (
                    <div className="stage-block">
                      {profileIsLocked ? (
                        <article className="panel gate-panel">
                          <p className="kicker">Primero tu señal</p>
                          <h2>Completa tu perfil para abrir Discover.</h2>
                          <p>
                            Necesitas bio, al menos 2 intereses, 1 foto y 1 prompt para que el sistema pueda curar afinidad real.
                          </p>
                          <button className="primary-button" type="button" onClick={() => setProductTab("profile")}>
                            Completar perfil
                          </button>
                        </article>
                      ) : currentCandidate ? (
                        <div className="discover-layout">
                          <article className="panel profile-stage">
                            <div className="profile-visual">
                              <img src={currentCandidate.photos[0]} alt={currentCandidate.displayName} />
                              <div className="score-orb">
                                <span>match score</span>
                                <strong>{currentCandidate.compatibilityScore}%</strong>
                              </div>
                            </div>

                            <div className="profile-copy">
                              <div className="title-row">
                                <div>
                                  <h2>
                                    {currentCandidate.displayName}, {currentCandidate.age}
                                  </h2>
                                  <p>
                                    {currentCandidate.city} · {currentCandidate.intention}
                                  </p>
                                </div>
                                {currentCandidate.isVerified ? <span className="status-badge">Verificado</span> : null}
                              </div>

                              <p className="lead-text">{currentCandidate.bio}</p>

                              <div className="detail-grid">
                                <div>
                                  <h4>Por que puede funcionar</h4>
                                  <div className="chip-row">
                                    {currentCandidate.compatibilityReasons.map((item) => (
                                      <span key={item} className="chip warm">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h4>Intereses</h4>
                                  <div className="chip-row">
                                    {currentCandidate.interests.map((item) => (
                                      <span key={item} className="chip">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h4>Valores</h4>
                                  <div className="chip-row">
                                    {currentCandidate.values.map((item) => (
                                      <span key={item} className="chip muted">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h4>Prompt</h4>
                                  <p className="prompt-quote">{currentCandidate.prompts[0] ?? "Aun sin prompt visible."}</p>
                                </div>
                              </div>
                            </div>

                            <div className="profile-actions">
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => handleInteraction("pass")}
                                disabled={busyKey === "interaction-pass"}
                              >
                                {busyKey === "interaction-pass" ? "Guardando..." : "Pasar"}
                              </button>
                              <button
                                className="primary-button"
                                type="button"
                                onClick={() => handleInteraction("like")}
                                disabled={busyKey === "interaction-like"}
                              >
                                {busyKey === "interaction-like" ? "Guardando..." : "Me interesa"}
                              </button>
                            </div>
                          </article>

                          <article className="panel moderation-panel">
                            <div className="section-head compact">
                              <p className="kicker">Moderacion visible</p>
                              <h3>Si algo no cuadra, actua aqui.</h3>
                            </div>

                            <select
                              value={reportForm.reason}
                              onChange={(event) => setReportForm((current) => ({ ...current, reason: event.target.value }))}
                            >
                              <option value="perfil-sospechoso">Perfil sospechoso</option>
                              <option value="fotos-falsas">Fotos falsas</option>
                              <option value="acoso">Acoso o presion</option>
                              <option value="spam">Spam o promo</option>
                            </select>
                            <textarea
                              value={reportForm.details}
                              onChange={(event) => setReportForm((current) => ({ ...current, details: event.target.value }))}
                              placeholder="Detalle opcional para el reporte"
                            />

                            <div className="dual-actions">
                              <button className="ghost-button" type="button" onClick={handleBlock} disabled={busyKey === "block"}>
                                {busyKey === "block" ? "Bloqueando..." : "Bloquear perfil"}
                              </button>
                              <button className="secondary-button" type="button" onClick={handleReport} disabled={busyKey === "report"}>
                                {busyKey === "report" ? "Enviando..." : "Reportar"}
                              </button>
                            </div>
                          </article>
                        </div>
                      ) : (
                        <article className="panel empty-stage">
                          <p className="kicker">Discover</p>
                          <h2>No quedan perfiles por ahora.</h2>
                          <p>
                            Puede ser porque ya curaste la cola actual o porque agotaste el ritmo del dia. Tus matches y chats siguen activos.
                          </p>
                        </article>
                      )}
                    </div>
                  ) : null}

                  {productTab === "matches" ? (
                    <div className="conversation-layout">
                      <article className="panel thread-list">
                        <div className="section-head compact">
                          <p className="kicker">Matches</p>
                          <h3>{matches.length} conexiones activas</h3>
                        </div>

                        {matches.length === 0 ? (
                          <div className="empty-inline">
                            <p>Aun no hay matches. Ve a Discover para abrir el primero.</p>
                          </div>
                        ) : (
                          matches.map((match) => (
                            <button
                              key={match.id}
                              type="button"
                              className={`thread-item ${selectedMatchId === match.id ? "is-active" : ""}`}
                              onClick={() => setSelectedMatchId(match.id)}
                            >
                              <img src={match.otherUser.photos[0]} alt={match.otherUser.displayName} />
                              <div>
                                <strong>{match.otherUser.displayName}</strong>
                                <span>{match.otherUser.city}</span>
                                <p>{match.lastMessage ?? "Aun sin mensajes."}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </article>

                      <article className="panel chat-stage">
                        {activeMatch ? (
                          <>
                            <div className="chat-head">
                              <div className="chat-identity">
                                <img src={activeMatch.otherUser.photos[0]} alt={activeMatch.otherUser.displayName} />
                                <div>
                                  <h3>{activeMatch.otherUser.displayName}</h3>
                                  <p>
                                    {activeMatch.otherUser.city} · {activeMatch.otherUser.compatibilityScore}% de match
                                  </p>
                                </div>
                              </div>
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => void fetchMessages(activeMatch.id, session.token)}
                              >
                                Refrescar
                              </button>
                            </div>

                            <div className="starter-row">
                              {starterMessages.map((message) => (
                                <button key={message} type="button" className="starter-chip" onClick={() => setMessageDraft(message)}>
                                  {message}
                                </button>
                              ))}
                            </div>

                            <div className="message-column">
                              {activeMessages.map((message) => (
                                <div
                                  key={message.id}
                                  className={`message-bubble ${message.sender_user_id === session.user.id ? "from-self" : "from-other"}`}
                                >
                                  <p>{message.content}</p>
                                  <span>{formatDateTime(message.created_at)}</span>
                                </div>
                              ))}
                            </div>

                            <form className="composer-row" onSubmit={handleSendMessage}>
                              <textarea
                                value={messageDraft}
                                onChange={(event) => setMessageDraft(event.target.value)}
                                placeholder="Escribe un mensaje claro. La app premia conversaciones reales."
                              />
                              <button className="primary-button" type="submit" disabled={busyKey === "message"}>
                                {busyKey === "message" ? "Enviando..." : "Enviar"}
                              </button>
                            </form>
                          </>
                        ) : (
                          <div className="empty-inline">
                            <p>Selecciona un match para abrir la conversacion.</p>
                          </div>
                        )}
                      </article>
                    </div>
                  ) : null}

                  {productTab === "profile" ? (
                    <div className="profile-editor-layout">
                      <form className="panel editor-form" onSubmit={handleProfileSubmit}>
                        <div className="section-head compact">
                          <p className="kicker">Perfil</p>
                          <h3>{profileIsLocked ? "Completa tu signal profile" : "Ajusta tu presencia"}</h3>
                          <p>
                            Si quieres discover de calidad, tu perfil tiene que dar informacion de verdad.
                          </p>
                        </div>

                        <div className="field-grid">
                          <label>
                            <span>Nombre visible</span>
                            <input
                              value={profileDraft.displayName}
                              onChange={(event) =>
                                setProfileDraft((current) => ({ ...current, displayName: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Ciudad</span>
                            <input
                              value={profileDraft.city}
                              onChange={(event) => setProfileDraft((current) => ({ ...current, city: event.target.value }))}
                            />
                          </label>
                          <label className="full-span">
                            <span>Bio</span>
                            <textarea
                              value={profileDraft.bio}
                              onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))}
                              placeholder="Que clase de conexion quieres construir y como se siente estar contigo."
                            />
                          </label>
                          <label>
                            <span>Intencion</span>
                            <input
                              value={profileDraft.intention}
                              onChange={(event) =>
                                setProfileDraft((current) => ({ ...current, intention: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Intereses</span>
                            <input
                              value={profileDraft.interests}
                              onChange={(event) =>
                                setProfileDraft((current) => ({ ...current, interests: event.target.value }))
                              }
                              placeholder="cafe, cine, caminatas"
                            />
                          </label>
                          <label className="full-span">
                            <span>Fotos por URL</span>
                            <input
                              value={profileDraft.photos}
                              onChange={(event) => setProfileDraft((current) => ({ ...current, photos: event.target.value }))}
                              placeholder="https://..., https://..."
                            />
                          </label>
                          <label className="full-span">
                            <span>Prompts</span>
                            <input
                              value={profileDraft.prompts}
                              onChange={(event) => setProfileDraft((current) => ({ ...current, prompts: event.target.value }))}
                              placeholder="Mi cita ideal..., Si conectamos..."
                            />
                          </label>
                          <label className="full-span">
                            <span>Valores</span>
                            <input
                              value={profileDraft.values}
                              onChange={(event) => setProfileDraft((current) => ({ ...current, values: event.target.value }))}
                              placeholder="respeto, humor, lealtad"
                            />
                          </label>
                          <label className="full-span">
                            <span>Lifestyle</span>
                            <input
                              value={profileDraft.lifestyle}
                              onChange={(event) =>
                                setProfileDraft((current) => ({ ...current, lifestyle: event.target.value }))
                              }
                              placeholder="tempranero, viajes, cocina en casa"
                            />
                          </label>
                        </div>

                        <button className="primary-button" type="submit" disabled={busyKey === "profile"}>
                          {busyKey === "profile" ? "Guardando..." : profileIsLocked ? "Completar perfil" : "Guardar cambios"}
                        </button>
                      </form>

                      <article className="panel profile-preview">
                        <p className="kicker">Checklist</p>
                        <h3>Que desbloquea la experiencia</h3>
                        <ul className="bullet-list">
                          <li>Bio escrita con contexto real.</li>
                          <li>Minimo 2 intereses separados por coma.</li>
                          <li>Al menos 1 foto por URL.</li>
                          <li>Minimo 1 prompt para abrir conversacion.</li>
                        </ul>

                        <div className="preview-card">
                          <strong>{profileDraft.displayName || session.user.fullName}</strong>
                          <span>{profileDraft.city || session.user.city}</span>
                          <p>{profileDraft.bio || "Tu bio aparecera aqui en cuanto la escribas."}</p>
                        </div>
                      </article>
                    </div>
                  ) : null}
                </section>
              </section>
            </>
          )}
        </main>
      ) : null}

      {viewMode === "admin" ? (
        <main className="admin-flow">
          <section className="panel admin-hero">
            <div className="section-head">
              <p className="kicker">Control</p>
              <h2>Panel ligero para operar el lanzamiento.</h2>
              <p>
                No hace falta un backoffice gigante para arrancar. Este bloque ya consume la API admin real con token.
              </p>
            </div>

            <div className="admin-token-row">
              <input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="ADMIN_TOKEN" />
              <button className="primary-button" type="button" onClick={loadAdminMetrics} disabled={busyKey === "admin"}>
                {busyKey === "admin" ? "Cargando..." : "Cargar panel"}
              </button>
            </div>
          </section>

          {adminMetrics ? (
            <>
              <section className="overview-grid">
                {Object.entries(adminMetrics.totals).map(([key, value]) => (
                  <article key={key} className="metric-card panel">
                    <span>{key}</span>
                    <strong>{value}</strong>
                    <small>Dato del sistema actual</small>
                  </article>
                ))}
              </section>

              <section className="admin-data-grid">
                <article className="panel admin-list">
                  <div className="section-head compact">
                    <p className="kicker">Moderacion</p>
                    <h3>Reportes recientes</h3>
                  </div>

                  {adminMetrics.recentReports.length === 0 ? (
                    <div className="empty-inline">
                      <p>No hay reportes por ahora.</p>
                    </div>
                  ) : (
                    adminMetrics.recentReports.map((report) => (
                      <div key={`${report.created_at}-${report.target_name}`} className="admin-row">
                        <strong>
                          {report.reporter_name} {"->"} {report.target_name}
                        </strong>
                        <span>{report.reason}</span>
                        <p>{report.details || "Sin detalle extra."}</p>
                      </div>
                    ))
                  )}
                </article>

                <article className="panel admin-list">
                  <div className="section-head compact">
                    <p className="kicker">Growth</p>
                    <h3>Leads recientes</h3>
                  </div>

                  {adminMetrics.recentLeads.length === 0 ? (
                    <div className="empty-inline">
                      <p>Aun no hay leads guardados.</p>
                    </div>
                  ) : (
                    adminMetrics.recentLeads.map((lead) => (
                      <div key={`${lead.email}-${lead.created_at}`} className="admin-row">
                        <strong>{lead.name}</strong>
                        <span>
                          {lead.email}
                          {lead.city ? ` · ${lead.city}` : ""}
                        </span>
                        <p>{lead.note || "Lead sin nota."}</p>
                      </div>
                    ))
                  )}
                </article>
              </section>
            </>
          ) : (
            <section className="panel empty-stage">
              <p className="kicker">Admin</p>
              <h2>Pega el token y carga el panel.</h2>
              <p>Token demo actual: `datecite-admin-token`.</p>
            </section>
          )}
        </main>
      ) : null}
    </div>
  );
}
