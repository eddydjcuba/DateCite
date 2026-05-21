export const FREE_DAILY_LIKES = 25;
export const FREE_DAILY_DIRECT_MESSAGES = 20;

export const launchConfig = {
  brand: {
    name: "Conexia",
    tagline: "Conoce con intención. Conecta sin paywalls abusivos.",
    heroTitle: "La app de citas seria para Latam que no te cobra por lo mínimo.",
    heroSubtitle:
      "Menos swipe vacío, más compatibilidad real. En free puedes descubrir, hacer match, chatear, reportar y bloquear. El pago acelera, no encierra.",
  },
  market: {
    region: "Latam",
    language: "es",
    positioning: "App romántica seria para relaciones estables y citas con intención.",
  },
  promise: {
    headline: "El plan gratuito se siente completo.",
    bullets: [
      "Chat libre entre matches sin premium obligatorio.",
      "Límites por volumen y visibilidad, no por funciones base.",
      "Compatibilidad guiada por valores, intención e intereses.",
      "Seguridad visible con 18+, reportes, bloqueos y futura verificación.",
    ],
  },
  features: [
    {
      title: "Compatibilidad guiada",
      copy: "Prompts, intención y estilo de vida antes que una galería vacía.",
    },
    {
      title: "Curación en descubrir",
      copy: "No hay feed infinito. Priorizamos perfiles con más afinidad real.",
    },
    {
      title: "Monetización ética",
      copy: "Se cobra por impulso, filtros avanzados y prioridad, no por hablar.",
    },
  ],
  freePlan: {
    name: "Free",
    monthlyPrice: "0",
    dailyLikeLimit: FREE_DAILY_LIKES,
    dailyDirectMessageLimit: FREE_DAILY_DIRECT_MESSAGES,
    weeklyBoosts: 1,
    features: [
      "Perfil completo y prompts de compatibilidad",
      "Descubrir con límite diario de likes",
      "Matches y chat ilimitado",
      "Filtros básicos, reportar y bloquear",
      "1 boost semanal",
    ],
  },
  plusPlan: {
    name: "Plus",
    monthlyPrice: "9.99",
    dailyLikeLimit: null,
    dailyDirectMessageLimit: null,
    weeklyBoosts: 5,
    features: [
      "Likes sin límite",
      "Ver quién te dio like",
      "Filtros avanzados y travel mode",
      "5 boosts semanales",
      "Prioridad suave en descubrir",
    ],
  },
  safety: {
    title: "La seguridad forma parte del producto",
    items: [
      "Validación de edad mínima 18+",
      "Reportes y bloqueos visibles desde el primer día",
      "Base lista para verificación manual en fase 2",
      "Check-in de cita reservado para futura versión",
    ],
  },
} as const;
