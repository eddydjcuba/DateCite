import type { DatabaseSync } from "node:sqlite";

import { hashPassword } from "./auth.js";

const demoPassword = "DateCiteDemo123!";

const sharedGallery = {
  elena: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
  ],
  mateo: [
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?auto=format&fit=crop&w=900&q=80",
  ],
  sara: [
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  ],
  lucas: [
    "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?auto=format&fit=crop&w=900&q=80",
  ],
  camila: [
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
  ],
  valentina: [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
  ],
  paula: [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  ],
  diana: [
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  ],
  abril: [
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  ],
  noa: [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
  ],
  nico: [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?auto=format&fit=crop&w=900&q=80",
  ],
};

const seedUsers = [
  {
    email: "admin@datecite.app",
    fullName: "DateCite Admin",
    birthDate: "1990-04-10",
    age: 35,
    city: "Ciudad de Mexico",
    plan: "plus",
    isAdmin: 1,
    profile: {
      displayName: "Admin DateCite",
      bio: "Cuenta de administracion para revisar metricas del lanzamiento.",
      city: "Ciudad de Mexico",
      intention: "relacion-seria",
      interests: ["Producto", "Moderacion", "Comunidad"],
      photos: sharedGallery.mateo,
      prompts: ["Creo productos que cuidan a la gente."],
      values: ["Respeto", "Claridad", "Seguridad"],
      lifestyle: ["Trabajo remoto", "Lectura", "Tecnologia"],
      zodiacSign: "aries",
      genderIdentity: "otra",
      seeking: ["mujer", "hombre", "no-binaria", "otra"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "elena@datecite.app",
    fullName: "Elena Solis",
    birthDate: "1997-06-02",
    age: 28,
    city: "Bogota",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Elena",
      bio: "Disenadora editorial. Me gustan las conversaciones lentas, el cafe largo y la gente con proposito.",
      city: "Bogota",
      intention: "relacion-seria",
      interests: ["Diseno", "Cafe", "Museos", "Viajes cortos"],
      photos: sharedGallery.elena,
      prompts: ["Mi domingo ideal tiene librerias, brunch y una caminata sin prisa."],
      values: ["Comunicacion", "Humor", "Ambicion sana"],
      lifestyle: ["Tempranera", "Noches tranquilas", "Mascotas"],
      zodiacSign: "geminis",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "mateo@datecite.app",
    fullName: "Mateo Varela",
    birthDate: "1994-01-12",
    age: 31,
    city: "Bogota",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Mateo",
      bio: "Arquitecto, cinefilo y obsesionado con encontrar una relacion estable sin juegos raros.",
      city: "Bogota",
      intention: "relacion-seria",
      interests: ["Cine", "Arquitectura", "Running", "Vino"],
      photos: sharedGallery.mateo,
      prompts: ["Si conectamos, prefiero ir por un cafe antes que hablar dos meses por chat."],
      values: ["Lealtad", "Constancia", "Afecto"],
      lifestyle: ["Activo", "Trabajo presencial", "Sin humo"],
      zodiacSign: "capricornio",
      genderIdentity: "hombre",
      seeking: ["mujer"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "sara@datecite.app",
    fullName: "Sara Lujan",
    birthDate: "1996-08-19",
    age: 29,
    city: "Ciudad de Mexico",
    plan: "plus",
    isAdmin: 0,
    profile: {
      displayName: "Sara",
      bio: "Fundadora de una marca pequena. Busco quimica, estabilidad y alguien que sume paz.",
      city: "Ciudad de Mexico",
      intention: "relacion-seria",
      interests: ["Emprender", "Yoga", "Brunch", "Arte"],
      photos: sharedGallery.sara,
      prompts: ["La mejor cita empieza con seguridad y termina con ganas de repetir."],
      values: ["Paz mental", "Responsabilidad afectiva", "Honestidad"],
      lifestyle: ["Activa", "Trabajo flexible", "Viajes"],
      zodiacSign: "leo",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 0,
      verificationStatus: "required",
      onboardingCompleted: 1,
    },
  },
  {
    email: "lucas@datecite.app",
    fullName: "Lucas Herrera",
    birthDate: "1992-11-05",
    age: 33,
    city: "Medellin",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Lucas",
      bio: "Chef creativo. Quiero construir algo real con alguien que disfrute reir y comer rico.",
      city: "Medellin",
      intention: "relacion-seria",
      interests: ["Cocina", "Musica", "Ciclismo", "Perros"],
      photos: sharedGallery.lucas,
      prompts: ["Puedo cocinar la primera cita si tu eliges la playlist."],
      values: ["Calidez", "Humildad", "Familia"],
      lifestyle: ["Muy social", "Nocturno ligero", "Cocina en casa"],
      zodiacSign: "escorpio",
      genderIdentity: "hombre",
      seeking: ["mujer"],
      isVerified: 0,
      verificationStatus: "required",
      onboardingCompleted: 1,
    },
  },
  {
    email: "camila@datecite.app",
    fullName: "Camila Rios",
    birthDate: "1998-03-14",
    age: 27,
    city: "Lima",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Camila",
      bio: "Psicologa. Me interesan las relaciones sanas, con tiempo, atencion y mucha conversacion.",
      city: "Lima",
      intention: "relacion-seria",
      interests: ["Psicologia", "Senderismo", "Podcasts", "Cafe"],
      photos: sharedGallery.camila,
      prompts: ["Si cuidas la forma en que hablas, ya tienes muchos puntos conmigo."],
      values: ["Empatia", "Calma", "Respeto"],
      lifestyle: ["Tempranera", "Planes al aire libre", "Cero drama"],
      zodiacSign: "piscis",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "valentina@datecite.app",
    fullName: "Valentina Mena",
    birthDate: "1999-05-07",
    age: 26,
    city: "Bogota",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Valentina",
      bio: "Fotografa nocturna. Busco una relacion bonita, estable y con conversaciones que no se queden en la superficie.",
      city: "Bogota",
      intention: "relacion-seria",
      interests: ["Fotografia", "Cafe", "Cine", "Musica"],
      photos: sharedGallery.valentina,
      prompts: ["Si hay humor, respeto y quimica real, ya empezamos bien."],
      values: ["Detalles", "Lealtad", "Madurez"],
      lifestyle: ["Creativa", "Noches suaves", "Paseos urbanos"],
      zodiacSign: "tauro",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "paula@datecite.app",
    fullName: "Paula Cardenas",
    birthDate: "1995-09-03",
    age: 30,
    city: "Medellin",
    plan: "plus",
    isAdmin: 0,
    profile: {
      displayName: "Paula",
      bio: "Productora musical. Me atrae la gente tranquila, trabajadora y con ganas reales de construir algo sano.",
      city: "Medellin",
      intention: "relacion-seria",
      interests: ["Musica", "Viajes", "Brunch", "Running"],
      photos: sharedGallery.paula,
      prompts: ["Prefiero una cita corta y honesta que semanas de charla vacia."],
      values: ["Responsabilidad afectiva", "Ternura", "Coherencia"],
      lifestyle: ["Activa", "Social", "Planes espontaneos"],
      zodiacSign: "virgo",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "diana@datecite.app",
    fullName: "Diana Ferrer",
    birthDate: "1993-12-22",
    age: 32,
    city: "Guadalajara",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Diana",
      bio: "Abogada. No busco perder tiempo: quiero paz, afinidad y una relacion con bases claras.",
      city: "Guadalajara",
      intention: "relacion-seria",
      interests: ["Lectura", "Cafe", "Museos", "Perros"],
      photos: sharedGallery.diana,
      prompts: ["Me gana alguien atento, sereno y con criterio propio."],
      values: ["Respeto", "Estabilidad", "Honestidad"],
      lifestyle: ["Tempranera", "Calma", "Planes tranquilos"],
      zodiacSign: "capricornio",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "abril@datecite.app",
    fullName: "Abril Sosa",
    birthDate: "2000-02-11",
    age: 26,
    city: "Buenos Aires",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Abril",
      bio: "Ilustradora y fan de las conversaciones largas. Quiero conocer a alguien cariñoso y claro con lo que busca.",
      city: "Buenos Aires",
      intention: "relacion-seria",
      interests: ["Arte", "Libros", "Cocina", "Series"],
      photos: sharedGallery.abril,
      prompts: ["Si sabes escuchar de verdad, ya sumas muchos puntos."],
      values: ["Empatia", "Humor", "Presencia"],
      lifestyle: ["Creativa", "Casa y salidas suaves", "Mascotas"],
      zodiacSign: "acuario",
      genderIdentity: "mujer",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "noa@datecite.app",
    fullName: "Noa Serrano",
    birthDate: "1997-10-27",
    age: 28,
    city: "Santiago",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Noa",
      bio: "Persona no binaria, tranquila y curiosa. Busco afecto sano, presencia y una conexion que se sienta facil.",
      city: "Santiago",
      intention: "relacion-seria",
      interests: ["Arte", "Cafe", "Podcasts", "Senderismo"],
      photos: sharedGallery.noa,
      prompts: ["Me gusta sentir que la otra persona esta de verdad aqui."],
      values: ["Apertura", "Respeto", "Escucha"],
      lifestyle: ["Calma", "Planes al aire libre", "Creativa"],
      zodiacSign: "libra",
      genderIdentity: "no-binaria",
      seeking: ["mujer", "hombre", "no-binaria"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
  {
    email: "nico@datecite.app",
    fullName: "Nico Duarte",
    birthDate: "1996-07-18",
    age: 29,
    city: "Lima",
    plan: "free",
    isAdmin: 0,
    profile: {
      displayName: "Nico",
      bio: "Editor de video. Me interesa una relacion real con otro hombre, sin juegos ni desapariciones raras.",
      city: "Lima",
      intention: "relacion-seria",
      interests: ["Cine", "Gaming", "Cafe", "Viajes"],
      photos: sharedGallery.nico,
      prompts: ["Me quedo donde hay calma, humor y comunicacion directa."],
      values: ["Claridad", "Fidelidad", "Complicidad"],
      lifestyle: ["Creativo", "Noches suaves", "Activo"],
      zodiacSign: "cancer",
      genderIdentity: "hombre",
      seeking: ["hombre"],
      isVerified: 1,
      verificationStatus: "verified",
      onboardingCompleted: 1,
    },
  },
];

function ensureUser(db: DatabaseSync, item: (typeof seedUsers)[number]) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(item.email) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, birth_date, age, city, plan, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.email,
    hashPassword(demoPassword),
    item.fullName,
    item.birthDate,
    item.age,
    item.city,
    item.plan,
    item.isAdmin,
  );
  const userId = Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO profiles (
      user_id, display_name, bio, city, intention, interests_json, photos_json,
      prompts_json, values_json, lifestyle_json, zodiac_sign, gender_identity, seeking_json, is_verified,
      verification_status, verification_selfie_uri, onboarding_completed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run(
    userId,
    item.profile.displayName,
    item.profile.bio,
    item.profile.city,
    item.profile.intention,
    JSON.stringify(item.profile.interests),
    JSON.stringify(item.profile.photos),
    JSON.stringify(item.profile.prompts),
    JSON.stringify(item.profile.values),
    JSON.stringify(item.profile.lifestyle),
    item.profile.zodiacSign,
    item.profile.genderIdentity,
    JSON.stringify(item.profile.seeking),
    item.profile.isVerified,
    item.profile.verificationStatus,
    item.profile.onboardingCompleted,
  );

  return userId;
}

function backfillDemoProfiles(db: DatabaseSync) {
  for (const item of seedUsers) {
    const userId = ensureUser(db, item);
    db.prepare(`
      UPDATE profiles
      SET zodiac_sign = CASE WHEN zodiac_sign = '' THEN ? ELSE zodiac_sign END,
          gender_identity = CASE WHEN gender_identity = '' THEN ? ELSE gender_identity END,
          seeking_json = CASE
            WHEN seeking_json = '' OR seeking_json = '[]' OR seeking_json IS NULL THEN ?
            ELSE seeking_json
          END,
          verification_status = CASE
            WHEN verification_status = '' OR verification_status IS NULL THEN ?
            ELSE verification_status
          END,
          is_verified = CASE
            WHEN is_verified NOT IN (0, 1) THEN ?
            ELSE is_verified
          END
      WHERE user_id = ?
    `).run(
      item.profile.zodiacSign,
      item.profile.genderIdentity,
      JSON.stringify(item.profile.seeking),
      item.profile.verificationStatus,
      item.profile.isVerified,
      userId,
    );
  }
}

function seedDemoNotifications(db: DatabaseSync, ids: number[]) {
  const [adminId, elenaId, mateoId, saraId, lucasId, camilaId] = ids;
  const now = new Date().toISOString();
  const firstMatch = db.prepare(`
    SELECT id FROM matches WHERE user_a_id = ? AND user_b_id = ?
  `).get(Math.min(elenaId, mateoId), Math.max(elenaId, mateoId)) as { id: number };
  const secondMatch = db.prepare(`
    SELECT id FROM matches WHERE user_a_id = ? AND user_b_id = ?
  `).get(Math.min(saraId, lucasId), Math.max(saraId, lucasId)) as { id: number };

  const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, actor_user_id, kind, title, body, match_id, is_read, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotification.run(mateoId, elenaId, "like_received", "Elena te dio like", "Ya hay interes mutuo en Bogota.", null, 0, now, null);
  insertNotification.run(mateoId, elenaId, "match_created", "Hiciste match con Elena", "El chat ya esta abierto para ustedes dos.", firstMatch.id, 0, now, null);
  insertNotification.run(mateoId, elenaId, "message_received", "Nuevo mensaje de Elena", "Hola. Me gusto que aqui todo se siente mas serio y directo.", firstMatch.id, 0, now, null);
  insertNotification.run(elenaId, mateoId, "match_created", "Hiciste match con Mateo", "Pueden empezar a hablar cuando quieran.", firstMatch.id, 1, now, now);
  insertNotification.run(lucasId, saraId, "match_created", "Hiciste match con Sara", "Tu nueva conversacion ya esta lista.", secondMatch.id, 0, now, null);
  insertNotification.run(adminId, camilaId, "like_received", "Camila visito tu energia", "Te dio like despues de ver tu perfil.", null, 0, now, null);
}

function backfillDemoNotifications(db: DatabaseSync) {
  const existing = db.prepare("SELECT COUNT(*) as total FROM notifications").get() as { total: number };
  if (existing.total > 0) {
    return;
  }

  const ids = seedUsers
    .map((item) => db.prepare("SELECT id FROM users WHERE email = ?").get(item.email) as { id: number } | undefined)
    .filter((row): row is { id: number } => Boolean(row))
    .map((row) => row.id);

  if (ids.length === seedUsers.length) {
    seedDemoNotifications(db, ids);
  }
}

export function seedDatabase(db: DatabaseSync) {
  const userCount = db.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
  if (userCount.total > 0) {
    backfillDemoProfiles(db);
    backfillDemoNotifications(db);
    return;
  }

  db.exec("BEGIN");

  try {
    const ids = seedUsers.map((item) => ensureUser(db, item));
    const [adminId, elenaId, mateoId, saraId, lucasId, camilaId] = ids;

    const upsertInteraction = db.prepare(`
      INSERT INTO interactions (actor_user_id, target_user_id, action, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(actor_user_id, target_user_id)
      DO UPDATE SET action = excluded.action, created_at = excluded.created_at
    `);
    const insertMatch = db.prepare(`
      INSERT OR IGNORE INTO matches (user_a_id, user_b_id, created_at)
      VALUES (?, ?, ?)
    `);
    const insertMessage = db.prepare(`
      INSERT INTO messages (match_id, sender_user_id, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const upsertVisit = db.prepare(`
      INSERT INTO profile_visits (actor_user_id, target_user_id, viewed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(actor_user_id, target_user_id)
      DO UPDATE SET viewed_at = excluded.viewed_at
    `);

    const now = new Date().toISOString();
    upsertInteraction.run(elenaId, mateoId, "like", now);
    upsertInteraction.run(mateoId, elenaId, "like", now);
    upsertInteraction.run(saraId, lucasId, "like", now);
    upsertInteraction.run(lucasId, saraId, "like", now);
    upsertInteraction.run(camilaId, adminId, "like", now);

    insertMatch.run(Math.min(elenaId, mateoId), Math.max(elenaId, mateoId), now);
    insertMatch.run(Math.min(saraId, lucasId), Math.max(saraId, lucasId), now);

    const firstMatch = db.prepare(`
      SELECT id FROM matches WHERE user_a_id = ? AND user_b_id = ?
    `).get(Math.min(elenaId, mateoId), Math.max(elenaId, mateoId)) as { id: number };
    const secondMatch = db.prepare(`
      SELECT id FROM matches WHERE user_a_id = ? AND user_b_id = ?
    `).get(Math.min(saraId, lucasId), Math.max(saraId, lucasId)) as { id: number };

    insertMessage.run(firstMatch.id, elenaId, "Hola. Me gusto que aqui todo se siente mas serio y directo.", now);
    insertMessage.run(firstMatch.id, mateoId, "Eso mismo vine a buscar. Te gustaria un cafe esta semana?", now);
    insertMessage.run(secondMatch.id, saraId, "Prometo no ghostear si prometes elegir buen lugar para cenar.", now);

    upsertVisit.run(mateoId, elenaId, now);
    upsertVisit.run(elenaId, mateoId, now);
    upsertVisit.run(camilaId, mateoId, now);
    seedDemoNotifications(db, ids);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const demoCredentials = {
  email: "mateo@datecite.app",
  password: demoPassword,
  adminEmail: "admin@datecite.app",
  adminPassword: demoPassword,
};
