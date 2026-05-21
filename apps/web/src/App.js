import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, getApiUrl } from "./api";
const TOKEN_STORAGE_KEY = "datecite.web.token";
const ADMIN_TOKEN_STORAGE_KEY = "datecite.web.adminToken";
const defaultConfig = {
    brand: {
        name: "DateCite",
        tagline: "Conoce con intencion.",
        heroTitle: "La app de citas seria para Latam que no te cobra por lo minimo.",
        heroSubtitle: "Menos swipe vacio, mas compatibilidad real. En free puedes descubrir, hacer match, chatear, reportar y bloquear.",
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
function readStorage(key, fallback = "") {
    if (typeof window === "undefined") {
        return fallback;
    }
    return window.localStorage.getItem(key) ?? fallback;
}
function writeStorage(key, value) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.setItem(key, value);
}
function removeStorage(key) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.removeItem(key);
}
function splitCommaList(value) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function joinList(value) {
    return value.join(", ");
}
function buildProfileDraft(session) {
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
function formatDateTime(value) {
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
function buildStarterMessages(profile) {
    if (!profile) {
        return [];
    }
    const starters = [];
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
    const [config, setConfig] = useState(defaultConfig);
    const [viewMode, setViewMode] = useState("landing");
    const [productTab, setProductTab] = useState("discover");
    const [authMode, setAuthMode] = useState("login");
    const [booting, setBooting] = useState(true);
    const [notice, setNotice] = useState(null);
    const [busyKey, setBusyKey] = useState(null);
    const [session, setSession] = useState(null);
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
    const [profileDraft, setProfileDraft] = useState(buildProfileDraft(null));
    const [discover, setDiscover] = useState(null);
    const [matches, setMatches] = useState([]);
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    const [messagesByMatchId, setMessagesByMatchId] = useState({});
    const [messageDraft, setMessageDraft] = useState("");
    const [reportForm, setReportForm] = useState({
        reason: "perfil-sospechoso",
        details: "",
    });
    const [adminToken, setAdminToken] = useState(() => readStorage(ADMIN_TOKEN_STORAGE_KEY, "datecite-admin-token"));
    const [adminMetrics, setAdminMetrics] = useState(null);
    const currentCandidate = discover?.profiles[0] ?? null;
    const nextCandidates = discover?.profiles.slice(1, 4) ?? [];
    const activeMatch = matches.find((item) => item.id === selectedMatchId) ?? null;
    const activeMessages = activeMatch ? messagesByMatchId[activeMatch.id] ?? [] : [];
    const starterMessages = useMemo(() => buildStarterMessages(activeMatch?.otherUser ?? null), [activeMatch]);
    const profileIsLocked = Boolean(session && !session.profile.onboardingCompleted);
    const likesCopy = discover?.likesRemaining === null
        ? "Likes sin limite"
        : `${discover?.likesRemaining ?? config.freePlan.dailyLikeLimit} likes hoy`;
    useEffect(() => {
        apiRequest("/api/launch-config")
            .then(setConfig)
            .catch((error) => {
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
    async function resumeSession(token) {
        setBooting(true);
        try {
            const me = await apiRequest("/api/auth/me", { token });
            const nextSession = { ...me, token };
            setSession(nextSession);
            setProfileDraft(buildProfileDraft(nextSession));
            setProductTab(nextSession.profile.onboardingCompleted ? "discover" : "profile");
            setViewMode("product");
            await refreshProductState(token, null);
        }
        catch (error) {
            removeStorage(TOKEN_STORAGE_KEY);
            setNotice(error instanceof Error ? error.message : "No pudimos restaurar tu sesion.");
        }
        finally {
            setBooting(false);
        }
    }
    function commitSession(payload) {
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
    async function refreshProductState(token, preferredMatchId) {
        const [discoverPayload, matchesPayload] = await Promise.all([
            apiRequest("/api/discover", { token }),
            apiRequest("/api/matches", { token }),
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
    async function fetchMessages(matchId, token, silent = false) {
        try {
            const response = await apiRequest(`/api/matches/${matchId}/messages`, { token });
            setMessagesByMatchId((current) => ({
                ...current,
                [matchId]: response.messages,
            }));
        }
        catch (error) {
            if (!silent) {
                setNotice(error instanceof Error ? error.message : "No pudimos cargar la conversacion.");
            }
        }
    }
    async function handleWaitlistSubmit(event) {
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
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos guardar el lead.");
        }
        finally {
            setBusyKey(null);
        }
    }
    async function handleAuthSubmit(event) {
        event.preventDefault();
        setBusyKey("auth");
        setNotice(null);
        try {
            const payload = authMode === "login"
                ? await apiRequest("/api/auth/login", {
                    method: "POST",
                    body: {
                        email: authForm.email,
                        password: authForm.password,
                    },
                })
                : await apiRequest("/api/auth/register", {
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
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos abrir tu sesion.");
        }
        finally {
            setBusyKey(null);
        }
    }
    async function handleProfileSubmit(event) {
        event.preventDefault();
        if (!session) {
            return;
        }
        setBusyKey("profile");
        setNotice(null);
        try {
            const payload = await apiRequest("/api/profile", {
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
            setNotice(nextSession.profile.onboardingCompleted
                ? "Perfil guardado. Tu cuenta ya esta lista para descubrir personas."
                : "Aun te falta bio, 2 intereses, 1 foto y 1 prompt para abrir Discover.");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos guardar tu perfil.");
        }
        finally {
            setBusyKey(null);
        }
    }
    async function handleInteraction(action) {
        if (!session || !currentCandidate) {
            return;
        }
        setBusyKey(`interaction-${action}`);
        setNotice(null);
        try {
            const result = await apiRequest("/api/interactions", {
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
            }
            else if (action === "like") {
                setNotice("Interes guardado.");
            }
            else {
                setNotice("Perfil descartado.");
            }
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos registrar tu decision.");
        }
        finally {
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
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos enviar el reporte.");
        }
        finally {
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
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos bloquear este perfil.");
        }
        finally {
            setBusyKey(null);
        }
    }
    async function handleSendMessage(event) {
        event.preventDefault();
        if (!session || !activeMatch || !messageDraft.trim()) {
            return;
        }
        setBusyKey("message");
        setNotice(null);
        try {
            const response = await apiRequest(`/api/matches/${activeMatch.id}/messages`, {
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
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos enviar el mensaje.");
        }
        finally {
            setBusyKey(null);
        }
    }
    async function loadAdminMetrics() {
        setBusyKey("admin");
        setNotice(null);
        try {
            const metrics = await apiRequest("/api/admin/metrics", {
                headers: {
                    "x-admin-token": adminToken,
                },
            });
            setAdminMetrics(metrics);
            setNotice("Panel de control actualizado.");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "No pudimos cargar el panel admin.");
        }
        finally {
            setBusyKey(null);
        }
    }
    if (booting) {
        return (_jsxs("div", { className: "site-shell loading-shell", children: [_jsx("div", { className: "ambient ambient-a" }), _jsx("div", { className: "ambient ambient-b" }), _jsxs("div", { className: "loading-card panel", children: [_jsx("p", { className: "kicker", children: "DateCite" }), _jsx("h1", { children: "Reconectando tu espacio." }), _jsx("p", { children: "Estamos restaurando la sesion, el discover y tus conversaciones." })] })] }));
    }
    return (_jsxs("div", { className: "site-shell", children: [_jsx("div", { className: "ambient ambient-a" }), _jsx("div", { className: "ambient ambient-b" }), _jsx("div", { className: "ambient ambient-c" }), _jsxs("header", { className: "topbar panel", children: [_jsxs("div", { className: "brand-lockup", children: [_jsx("p", { className: "kicker", children: config.brand.name }), _jsx("h1", { children: config.brand.tagline }), _jsx("span", { className: "brand-subtitle", children: config.market.positioning })] }), _jsxs("nav", { className: "mode-nav", children: [_jsx("button", { className: `nav-pill ${viewMode === "landing" ? "is-active" : ""}`, type: "button", onClick: () => setViewMode("landing"), children: "Inicio" }), _jsx("button", { className: `nav-pill ${viewMode === "product" ? "is-active" : ""}`, type: "button", onClick: () => setViewMode(session ? "product" : "landing"), children: "Producto" }), _jsx("button", { className: `nav-pill ${viewMode === "admin" ? "is-active" : ""}`, type: "button", onClick: () => setViewMode("admin"), children: "Control" })] }), _jsxs("div", { className: "topbar-actions", children: [_jsx("span", { className: "status-badge", children: session ? likesCopy : "Soft launch listo" }), session ? (_jsx("button", { className: "ghost-button", type: "button", onClick: clearSession, children: "Salir" })) : (_jsx("button", { className: "primary-button", type: "button", onClick: () => setViewMode("landing"), children: "Probar demo" }))] })] }), notice ? _jsx("div", { className: "notice-bar panel", children: notice }) : null, viewMode === "landing" ? (_jsxs("main", { className: "landing-flow", children: [_jsxs("section", { className: "hero-grid", children: [_jsxs("article", { className: "hero-stage panel", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("span", { className: "spot-pill", children: "Signal-first dating" }), _jsx("h2", { children: config.brand.heroTitle }), _jsx("p", { children: config.brand.heroSubtitle }), _jsxs("div", { className: "hero-actions", children: [_jsx("button", { className: "primary-button", type: "button", onClick: () => setViewMode(session ? "product" : "landing"), children: session ? "Entrar al producto" : "Entrar con demo" }), _jsx("a", { className: "ghost-button", href: "#waitlist", children: "Captar usuarios" })] })] }), _jsxs("div", { className: "hero-orbit", children: [_jsxs("div", { className: "orbit-core", children: [_jsx("span", { className: "orbit-label", children: "Free" }), _jsx("strong", { children: config.freePlan.dailyLikeLimit }), _jsx("small", { children: "likes con chat libre" })] }), _jsx("div", { className: "orbit-ring orbit-ring-one" }), _jsx("div", { className: "orbit-ring orbit-ring-two" }), _jsxs("div", { className: "orbit-card orbit-card-top", children: [_jsx("span", { children: "Promesa" }), _jsx("strong", { children: "Sin paywalls toxicos" })] }), _jsxs("div", { className: "orbit-card orbit-card-bottom", children: [_jsx("span", { children: "Enfoque" }), _jsx("strong", { children: "Relaciones con intencion" })] })] })] }), _jsxs("aside", { className: "auth-stage panel", children: [_jsxs("div", { className: "auth-head", children: [_jsx("p", { className: "kicker", children: "Acceso" }), _jsx("h3", { children: authMode === "login" ? "Entra al MVP ahora" : "Crea una cuenta real" }), _jsx("p", { children: "El cliente web ya usa la API completa: auth, discover, matches, chat, reportes y perfil." })] }), _jsxs("div", { className: "auth-switch", children: [_jsx("button", { type: "button", className: `micro-pill ${authMode === "login" ? "is-active" : ""}`, onClick: () => setAuthMode("login"), children: "Login" }), _jsx("button", { type: "button", className: `micro-pill ${authMode === "register" ? "is-active" : ""}`, onClick: () => setAuthMode("register"), children: "Registro" })] }), _jsxs("form", { className: "stack-form", onSubmit: handleAuthSubmit, children: [_jsx("input", { value: authForm.email, onChange: (event) => setAuthForm((current) => ({ ...current, email: event.target.value })), placeholder: "Correo", type: "email" }), _jsx("input", { value: authForm.password, onChange: (event) => setAuthForm((current) => ({ ...current, password: event.target.value })), placeholder: "Contrasena", type: "password" }), authMode === "register" ? (_jsxs(_Fragment, { children: [_jsx("input", { value: authForm.fullName, onChange: (event) => setAuthForm((current) => ({ ...current, fullName: event.target.value })), placeholder: "Nombre completo" }), _jsx("input", { value: authForm.displayName, onChange: (event) => setAuthForm((current) => ({ ...current, displayName: event.target.value })), placeholder: "Nombre visible" }), _jsx("input", { value: authForm.birthDate, onChange: (event) => setAuthForm((current) => ({ ...current, birthDate: event.target.value })), placeholder: "Nacimiento YYYY-MM-DD" }), _jsx("input", { value: authForm.city, onChange: (event) => setAuthForm((current) => ({ ...current, city: event.target.value })), placeholder: "Ciudad" })] })) : null, _jsx("button", { className: "primary-button", type: "submit", disabled: busyKey === "auth", children: busyKey === "auth" ? "Procesando..." : authMode === "login" ? "Abrir sesion" : "Crear cuenta" })] }), _jsxs("div", { className: "demo-note", children: [_jsx("strong", { children: "Demo lista:" }), " `mateo@datecite.app` / `DateCiteDemo123!`"] })] })] }), _jsxs("section", { className: "promise-ribbon panel", children: [_jsxs("div", { children: [_jsx("p", { className: "kicker", children: "Promesa central" }), _jsx("h3", { children: config.promise.headline })] }), _jsx("div", { className: "promise-grid", children: config.promise.bullets.map((item) => (_jsx("article", { className: "mini-panel", children: item }, item))) })] }), _jsxs("section", { className: "feature-shelf", children: [config.features.map((feature) => (_jsxs("article", { className: "feature-card panel", children: [_jsx("p", { className: "kicker", children: "Sistema" }), _jsx("h3", { children: feature.title }), _jsx("p", { children: feature.copy })] }, feature.title))), _jsxs("article", { className: "feature-card panel", children: [_jsx("p", { className: "kicker", children: "Modelo" }), _jsx("h3", { children: "Free util, Plus acelerado" }), _jsx("p", { children: "El usuario gratuito puede crear perfil, descubrir, hacer match, chatear, reportar y bloquear." })] }), _jsxs("article", { className: "feature-card panel", children: [_jsx("p", { className: "kicker", children: "Tono" }), _jsx("h3", { children: "Menos juego, mas se\u00F1al" }), _jsx("p", { children: "La interfaz empuja perfil, compatibilidad y conversacion; no solo imagen ni loops de dopamina." })] })] }), _jsxs("section", { className: "launch-grid", children: [_jsxs("article", { id: "waitlist", className: "panel waitlist-stage", children: [_jsxs("div", { className: "section-head", children: [_jsx("p", { className: "kicker", children: "Captacion" }), _jsx("h3", { children: "Recoge demanda hoy mismo." }), _jsx("p", { children: "Puedes validar ciudades, tono de usuarios y mensajes de valor antes de escalar pagos o moderacion." })] }), _jsxs("form", { className: "stack-form", onSubmit: handleWaitlistSubmit, children: [_jsx("input", { value: waitlistForm.name, onChange: (event) => setWaitlistForm((current) => ({ ...current, name: event.target.value })), placeholder: "Nombre" }), _jsx("input", { value: waitlistForm.email, onChange: (event) => setWaitlistForm((current) => ({ ...current, email: event.target.value })), placeholder: "Correo", type: "email" }), _jsx("input", { value: waitlistForm.city, onChange: (event) => setWaitlistForm((current) => ({ ...current, city: event.target.value })), placeholder: "Ciudad" }), _jsx("textarea", { value: waitlistForm.note, onChange: (event) => setWaitlistForm((current) => ({ ...current, note: event.target.value })), placeholder: "Que busca o por que le interesa" }), _jsx("button", { className: "primary-button", type: "submit", disabled: busyKey === "waitlist", children: busyKey === "waitlist" ? "Guardando..." : "Guardar lead" })] })] }), _jsxs("article", { className: "panel ritual-stage", children: [_jsxs("div", { className: "section-head", children: [_jsx("p", { className: "kicker", children: "Experiencia" }), _jsx("h3", { children: "Una atmosfera mas adulta que una app de swipe normal." })] }), _jsxs("div", { className: "ritual-list", children: [_jsxs("div", { className: "ritual-item", children: [_jsx("span", { children: "01" }), _jsxs("div", { children: [_jsx("strong", { children: "Signal profile" }), _jsx("p", { children: "Bio, prompts, valores y estilo de vida antes del juego visual." })] })] }), _jsxs("div", { className: "ritual-item", children: [_jsx("span", { children: "02" }), _jsxs("div", { children: [_jsx("strong", { children: "Curacion limitada" }), _jsx("p", { children: "Menos perfiles, pero mejor priorizados por intencion y afinidad real." })] })] }), _jsxs("div", { className: "ritual-item", children: [_jsx("span", { children: "03" }), _jsxs("div", { children: [_jsx("strong", { children: "Chat abierto" }), _jsx("p", { children: "Si hubo match, la conversacion no queda secuestrada por un paywall." })] })] })] })] })] })] })) : null, viewMode === "product" ? (_jsx("main", { className: "product-flow", children: !session ? (_jsxs("section", { className: "panel empty-stage", children: [_jsx("p", { className: "kicker", children: "Sin sesion" }), _jsx("h2", { children: "Abre el producto desde la cuenta demo o crea una nueva." }), _jsx("p", { children: "La experiencia completa vive dentro de este cliente web y ya esta conectada a la API." })] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: "overview-grid", children: [_jsxs("article", { className: "metric-card panel", children: [_jsx("span", { children: "Plan" }), _jsx("strong", { children: session.user.plan.toUpperCase() }), _jsx("small", { children: session.profile.isVerified ? "Perfil verificado" : "Verificacion reservada para fase 2" })] }), _jsxs("article", { className: "metric-card panel", children: [_jsx("span", { children: "Hoy" }), _jsx("strong", { children: likesCopy }), _jsxs("small", { children: [discover?.likesUsed ?? 0, " usados en esta sesion diaria"] })] }), _jsxs("article", { className: "metric-card panel", children: [_jsx("span", { children: "Matches" }), _jsx("strong", { children: matches.length }), _jsx("small", { children: "Chat libre entre perfiles compatibles" })] }), _jsxs("article", { className: "metric-card panel", children: [_jsx("span", { children: "API" }), _jsx("strong", { children: "Live" }), _jsx("small", { children: getApiUrl() })] })] }), _jsxs("section", { className: "workspace", children: [_jsxs("aside", { className: "workspace-rail", children: [_jsxs("article", { className: "panel account-panel", children: [_jsx("p", { className: "kicker", children: "Tu cuenta" }), _jsx("h3", { children: session.profile.displayName || session.user.fullName }), _jsxs("p", { children: [session.user.age, " anos \u00B7 ", session.profile.city] }), _jsxs("div", { className: "chip-row", children: [_jsx("span", { className: "chip", children: session.profile.intention }), _jsx("span", { className: "chip", children: session.user.plan }), session.profile.isVerified ? _jsx("span", { className: "chip", children: "verificado" }) : null] })] }), _jsxs("article", { className: "panel tab-panel", children: [_jsx("p", { className: "kicker", children: "Workspace" }), _jsxs("div", { className: "tab-stack", children: [_jsx("button", { type: "button", className: `stack-tab ${productTab === "discover" ? "is-active" : ""}`, onClick: () => setProductTab("discover"), children: "Discover" }), _jsx("button", { type: "button", className: `stack-tab ${productTab === "matches" ? "is-active" : ""}`, onClick: () => setProductTab("matches"), children: "Matches" }), _jsx("button", { type: "button", className: `stack-tab ${productTab === "profile" ? "is-active" : ""}`, onClick: () => setProductTab("profile"), children: "Perfil" })] })] }), _jsxs("article", { className: "panel plan-panel", children: [_jsx("p", { className: "kicker", children: "Free vs Plus" }), _jsx("h3", { children: "El pago acelera, no encierra." }), _jsxs("ul", { className: "bullet-list", children: [_jsxs("li", { children: [config.freePlan.dailyLikeLimit, " likes diarios para free."] }), _jsx("li", { children: "Chat sin limite una vez existe el match." }), _jsxs("li", { children: ["$", config.plusPlan.monthlyPrice, "/mes para alcance y filtros avanzados."] })] })] }), nextCandidates.length > 0 ? (_jsxs("article", { className: "panel queue-panel", children: [_jsx("p", { className: "kicker", children: "Siguiente cola" }), nextCandidates.map((profile) => (_jsxs("div", { className: "queue-item", children: [_jsx("strong", { children: profile.displayName }), _jsxs("span", { children: [profile.compatibilityScore, "% de afinidad"] })] }, profile.userId)))] })) : null] }), _jsxs("section", { className: "workspace-stage", children: [productTab === "discover" ? (_jsx("div", { className: "stage-block", children: profileIsLocked ? (_jsxs("article", { className: "panel gate-panel", children: [_jsx("p", { className: "kicker", children: "Primero tu se\u00F1al" }), _jsx("h2", { children: "Completa tu perfil para abrir Discover." }), _jsx("p", { children: "Necesitas bio, al menos 2 intereses, 1 foto y 1 prompt para que el sistema pueda curar afinidad real." }), _jsx("button", { className: "primary-button", type: "button", onClick: () => setProductTab("profile"), children: "Completar perfil" })] })) : currentCandidate ? (_jsxs("div", { className: "discover-layout", children: [_jsxs("article", { className: "panel profile-stage", children: [_jsxs("div", { className: "profile-visual", children: [_jsx("img", { src: currentCandidate.photos[0], alt: currentCandidate.displayName }), _jsxs("div", { className: "score-orb", children: [_jsx("span", { children: "match score" }), _jsxs("strong", { children: [currentCandidate.compatibilityScore, "%"] })] })] }), _jsxs("div", { className: "profile-copy", children: [_jsxs("div", { className: "title-row", children: [_jsxs("div", { children: [_jsxs("h2", { children: [currentCandidate.displayName, ", ", currentCandidate.age] }), _jsxs("p", { children: [currentCandidate.city, " \u00B7 ", currentCandidate.intention] })] }), currentCandidate.isVerified ? _jsx("span", { className: "status-badge", children: "Verificado" }) : null] }), _jsx("p", { className: "lead-text", children: currentCandidate.bio }), _jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("h4", { children: "Por que puede funcionar" }), _jsx("div", { className: "chip-row", children: currentCandidate.compatibilityReasons.map((item) => (_jsx("span", { className: "chip warm", children: item }, item))) })] }), _jsxs("div", { children: [_jsx("h4", { children: "Intereses" }), _jsx("div", { className: "chip-row", children: currentCandidate.interests.map((item) => (_jsx("span", { className: "chip", children: item }, item))) })] }), _jsxs("div", { children: [_jsx("h4", { children: "Valores" }), _jsx("div", { className: "chip-row", children: currentCandidate.values.map((item) => (_jsx("span", { className: "chip muted", children: item }, item))) })] }), _jsxs("div", { children: [_jsx("h4", { children: "Prompt" }), _jsx("p", { className: "prompt-quote", children: currentCandidate.prompts[0] ?? "Aun sin prompt visible." })] })] })] }), _jsxs("div", { className: "profile-actions", children: [_jsx("button", { className: "ghost-button", type: "button", onClick: () => handleInteraction("pass"), disabled: busyKey === "interaction-pass", children: busyKey === "interaction-pass" ? "Guardando..." : "Pasar" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => handleInteraction("like"), disabled: busyKey === "interaction-like", children: busyKey === "interaction-like" ? "Guardando..." : "Me interesa" })] })] }), _jsxs("article", { className: "panel moderation-panel", children: [_jsxs("div", { className: "section-head compact", children: [_jsx("p", { className: "kicker", children: "Moderacion visible" }), _jsx("h3", { children: "Si algo no cuadra, actua aqui." })] }), _jsxs("select", { value: reportForm.reason, onChange: (event) => setReportForm((current) => ({ ...current, reason: event.target.value })), children: [_jsx("option", { value: "perfil-sospechoso", children: "Perfil sospechoso" }), _jsx("option", { value: "fotos-falsas", children: "Fotos falsas" }), _jsx("option", { value: "acoso", children: "Acoso o presion" }), _jsx("option", { value: "spam", children: "Spam o promo" })] }), _jsx("textarea", { value: reportForm.details, onChange: (event) => setReportForm((current) => ({ ...current, details: event.target.value })), placeholder: "Detalle opcional para el reporte" }), _jsxs("div", { className: "dual-actions", children: [_jsx("button", { className: "ghost-button", type: "button", onClick: handleBlock, disabled: busyKey === "block", children: busyKey === "block" ? "Bloqueando..." : "Bloquear perfil" }), _jsx("button", { className: "secondary-button", type: "button", onClick: handleReport, disabled: busyKey === "report", children: busyKey === "report" ? "Enviando..." : "Reportar" })] })] })] })) : (_jsxs("article", { className: "panel empty-stage", children: [_jsx("p", { className: "kicker", children: "Discover" }), _jsx("h2", { children: "No quedan perfiles por ahora." }), _jsx("p", { children: "Puede ser porque ya curaste la cola actual o porque agotaste el ritmo del dia. Tus matches y chats siguen activos." })] })) })) : null, productTab === "matches" ? (_jsxs("div", { className: "conversation-layout", children: [_jsxs("article", { className: "panel thread-list", children: [_jsxs("div", { className: "section-head compact", children: [_jsx("p", { className: "kicker", children: "Matches" }), _jsxs("h3", { children: [matches.length, " conexiones activas"] })] }), matches.length === 0 ? (_jsx("div", { className: "empty-inline", children: _jsx("p", { children: "Aun no hay matches. Ve a Discover para abrir el primero." }) })) : (matches.map((match) => (_jsxs("button", { type: "button", className: `thread-item ${selectedMatchId === match.id ? "is-active" : ""}`, onClick: () => setSelectedMatchId(match.id), children: [_jsx("img", { src: match.otherUser.photos[0], alt: match.otherUser.displayName }), _jsxs("div", { children: [_jsx("strong", { children: match.otherUser.displayName }), _jsx("span", { children: match.otherUser.city }), _jsx("p", { children: match.lastMessage ?? "Aun sin mensajes." })] })] }, match.id))))] }), _jsx("article", { className: "panel chat-stage", children: activeMatch ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "chat-head", children: [_jsxs("div", { className: "chat-identity", children: [_jsx("img", { src: activeMatch.otherUser.photos[0], alt: activeMatch.otherUser.displayName }), _jsxs("div", { children: [_jsx("h3", { children: activeMatch.otherUser.displayName }), _jsxs("p", { children: [activeMatch.otherUser.city, " \u00B7 ", activeMatch.otherUser.compatibilityScore, "% de match"] })] })] }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => void fetchMessages(activeMatch.id, session.token), children: "Refrescar" })] }), _jsx("div", { className: "starter-row", children: starterMessages.map((message) => (_jsx("button", { type: "button", className: "starter-chip", onClick: () => setMessageDraft(message), children: message }, message))) }), _jsx("div", { className: "message-column", children: activeMessages.map((message) => (_jsxs("div", { className: `message-bubble ${message.sender_user_id === session.user.id ? "from-self" : "from-other"}`, children: [_jsx("p", { children: message.content }), _jsx("span", { children: formatDateTime(message.created_at) })] }, message.id))) }), _jsxs("form", { className: "composer-row", onSubmit: handleSendMessage, children: [_jsx("textarea", { value: messageDraft, onChange: (event) => setMessageDraft(event.target.value), placeholder: "Escribe un mensaje claro. La app premia conversaciones reales." }), _jsx("button", { className: "primary-button", type: "submit", disabled: busyKey === "message", children: busyKey === "message" ? "Enviando..." : "Enviar" })] })] })) : (_jsx("div", { className: "empty-inline", children: _jsx("p", { children: "Selecciona un match para abrir la conversacion." }) })) })] })) : null, productTab === "profile" ? (_jsxs("div", { className: "profile-editor-layout", children: [_jsxs("form", { className: "panel editor-form", onSubmit: handleProfileSubmit, children: [_jsxs("div", { className: "section-head compact", children: [_jsx("p", { className: "kicker", children: "Perfil" }), _jsx("h3", { children: profileIsLocked ? "Completa tu signal profile" : "Ajusta tu presencia" }), _jsx("p", { children: "Si quieres discover de calidad, tu perfil tiene que dar informacion de verdad." })] }), _jsxs("div", { className: "field-grid", children: [_jsxs("label", { children: [_jsx("span", { children: "Nombre visible" }), _jsx("input", { value: profileDraft.displayName, onChange: (event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "Ciudad" }), _jsx("input", { value: profileDraft.city, onChange: (event) => setProfileDraft((current) => ({ ...current, city: event.target.value })) })] }), _jsxs("label", { className: "full-span", children: [_jsx("span", { children: "Bio" }), _jsx("textarea", { value: profileDraft.bio, onChange: (event) => setProfileDraft((current) => ({ ...current, bio: event.target.value })), placeholder: "Que clase de conexion quieres construir y como se siente estar contigo." })] }), _jsxs("label", { children: [_jsx("span", { children: "Intencion" }), _jsx("input", { value: profileDraft.intention, onChange: (event) => setProfileDraft((current) => ({ ...current, intention: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: "Intereses" }), _jsx("input", { value: profileDraft.interests, onChange: (event) => setProfileDraft((current) => ({ ...current, interests: event.target.value })), placeholder: "cafe, cine, caminatas" })] }), _jsxs("label", { className: "full-span", children: [_jsx("span", { children: "Fotos por URL" }), _jsx("input", { value: profileDraft.photos, onChange: (event) => setProfileDraft((current) => ({ ...current, photos: event.target.value })), placeholder: "https://..., https://..." })] }), _jsxs("label", { className: "full-span", children: [_jsx("span", { children: "Prompts" }), _jsx("input", { value: profileDraft.prompts, onChange: (event) => setProfileDraft((current) => ({ ...current, prompts: event.target.value })), placeholder: "Mi cita ideal..., Si conectamos..." })] }), _jsxs("label", { className: "full-span", children: [_jsx("span", { children: "Valores" }), _jsx("input", { value: profileDraft.values, onChange: (event) => setProfileDraft((current) => ({ ...current, values: event.target.value })), placeholder: "respeto, humor, lealtad" })] }), _jsxs("label", { className: "full-span", children: [_jsx("span", { children: "Lifestyle" }), _jsx("input", { value: profileDraft.lifestyle, onChange: (event) => setProfileDraft((current) => ({ ...current, lifestyle: event.target.value })), placeholder: "tempranero, viajes, cocina en casa" })] })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: busyKey === "profile", children: busyKey === "profile" ? "Guardando..." : profileIsLocked ? "Completar perfil" : "Guardar cambios" })] }), _jsxs("article", { className: "panel profile-preview", children: [_jsx("p", { className: "kicker", children: "Checklist" }), _jsx("h3", { children: "Que desbloquea la experiencia" }), _jsxs("ul", { className: "bullet-list", children: [_jsx("li", { children: "Bio escrita con contexto real." }), _jsx("li", { children: "Minimo 2 intereses separados por coma." }), _jsx("li", { children: "Al menos 1 foto por URL." }), _jsx("li", { children: "Minimo 1 prompt para abrir conversacion." })] }), _jsxs("div", { className: "preview-card", children: [_jsx("strong", { children: profileDraft.displayName || session.user.fullName }), _jsx("span", { children: profileDraft.city || session.user.city }), _jsx("p", { children: profileDraft.bio || "Tu bio aparecera aqui en cuanto la escribas." })] })] })] })) : null] })] })] })) })) : null, viewMode === "admin" ? (_jsxs("main", { className: "admin-flow", children: [_jsxs("section", { className: "panel admin-hero", children: [_jsxs("div", { className: "section-head", children: [_jsx("p", { className: "kicker", children: "Control" }), _jsx("h2", { children: "Panel ligero para operar el lanzamiento." }), _jsx("p", { children: "No hace falta un backoffice gigante para arrancar. Este bloque ya consume la API admin real con token." })] }), _jsxs("div", { className: "admin-token-row", children: [_jsx("input", { value: adminToken, onChange: (event) => setAdminToken(event.target.value), placeholder: "ADMIN_TOKEN" }), _jsx("button", { className: "primary-button", type: "button", onClick: loadAdminMetrics, disabled: busyKey === "admin", children: busyKey === "admin" ? "Cargando..." : "Cargar panel" })] })] }), adminMetrics ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "overview-grid", children: Object.entries(adminMetrics.totals).map(([key, value]) => (_jsxs("article", { className: "metric-card panel", children: [_jsx("span", { children: key }), _jsx("strong", { children: value }), _jsx("small", { children: "Dato del sistema actual" })] }, key))) }), _jsxs("section", { className: "admin-data-grid", children: [_jsxs("article", { className: "panel admin-list", children: [_jsxs("div", { className: "section-head compact", children: [_jsx("p", { className: "kicker", children: "Moderacion" }), _jsx("h3", { children: "Reportes recientes" })] }), adminMetrics.recentReports.length === 0 ? (_jsx("div", { className: "empty-inline", children: _jsx("p", { children: "No hay reportes por ahora." }) })) : (adminMetrics.recentReports.map((report) => (_jsxs("div", { className: "admin-row", children: [_jsxs("strong", { children: [report.reporter_name, " ", "->", " ", report.target_name] }), _jsx("span", { children: report.reason }), _jsx("p", { children: report.details || "Sin detalle extra." })] }, `${report.created_at}-${report.target_name}`))))] }), _jsxs("article", { className: "panel admin-list", children: [_jsxs("div", { className: "section-head compact", children: [_jsx("p", { className: "kicker", children: "Growth" }), _jsx("h3", { children: "Leads recientes" })] }), adminMetrics.recentLeads.length === 0 ? (_jsx("div", { className: "empty-inline", children: _jsx("p", { children: "Aun no hay leads guardados." }) })) : (adminMetrics.recentLeads.map((lead) => (_jsxs("div", { className: "admin-row", children: [_jsx("strong", { children: lead.name }), _jsxs("span", { children: [lead.email, lead.city ? ` · ${lead.city}` : ""] }), _jsx("p", { children: lead.note || "Lead sin nota." })] }, `${lead.email}-${lead.created_at}`))))] })] })] })) : (_jsxs("section", { className: "panel empty-stage", children: [_jsx("p", { className: "kicker", children: "Admin" }), _jsx("h2", { children: "Pega el token y carga el panel." }), _jsx("p", { children: "Token demo actual: `datecite-admin-token`." })] }))] })) : null] }));
}
