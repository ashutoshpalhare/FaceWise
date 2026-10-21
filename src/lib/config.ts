import { z } from "zod";

/**
 * Central, validated configuration. Every value has a safe default so the app
 * boots without a hand-edited .env, and every knob the V2 branch hardcoded
 * (threshold 70, 50 captures, in-memory session) is now configurable.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_SECRET: z.string().min(16).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(10),
  LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** SFace (InsightFace-family) cosine similarity required to auto-accept a match. */
  SFACE_MIN_SIMILARITY: z.coerce.number().min(0.2).max(0.9).default(0.42),
  /** Review band: between review and accept the face is shown but NOT recorded. */
  SFACE_REVIEW_SIMILARITY: z.coerce.number().min(0.1).max(0.9).default(0.33),
  /** LBPH fallback: normalized histogram intersection score to accept. */
  LBPH_MIN_SIMILARITY: z.coerce.number().min(0.3).max(0.98).default(0.62),
  LBPH_REVIEW_SIMILARITY: z.coerce.number().min(0.2).max(0.98).default(0.52),
  /** Enrollment capture policy (V2 fixed 50; configurable, quality-gated). */
  ENROLL_TARGET_CAPTURES: z.coerce.number().int().min(10).max(120).default(50),
  ENROLL_MIN_CAPTURES: z.coerce.number().int().min(3).max(60).default(12),
  ENROLL_STORE_TOP_TEMPLATES: z.coerce.number().int().min(3).max(25).default(10),
  /** Recognition consensus: a face must repeat across N of M frames before recording. */
  RECOGNITION_FRAMES_REQUIRED: z.coerce.number().int().min(1).max(5).default(2),
  /** Minimum motion energy in the face ROI (0-1). Guards against static photos. */
  LIVENESS_MIN_MOTION: z.coerce.number().min(0).max(1).default(0.015),
  /** CDN path for @vladmandic/face-api models (MIT). Overridable for air-gapped installs. */
  FACE_API_MODEL_URL: z.string().url().default("https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model"),
  /** Allow the static photo-file enrollment fallback when no camera is present. */
  ALLOW_PHOTO_ENROLLMENT: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration — ${issues}`);
}

export const config = {
  sessionTtlHours: parsed.data.SESSION_TTL_HOURS,
  loginMaxAttempts: parsed.data.LOGIN_MAX_ATTEMPTS,
  loginWindowSeconds: parsed.data.LOGIN_WINDOW_SECONDS,
  enrollTargetCaptures: parsed.data.ENROLL_TARGET_CAPTURES,
  enrollMinCaptures: parsed.data.ENROLL_MIN_CAPTURES,
  enrollStoreTopTemplates: parsed.data.ENROLL_STORE_TOP_TEMPLATES,
  recognitionFramesRequired: parsed.data.RECOGNITION_FRAMES_REQUIRED,
  livenessMinMotion: parsed.data.LIVENESS_MIN_MOTION,
  faceApiModelUrl: parsed.data.FACE_API_MODEL_URL,
  allowPhotoEnrollment: parsed.data.ALLOW_PHOTO_ENROLLMENT,
  secret: parsed.data.APP_SECRET ?? "facewise-dev-secret-change-me-please",
  thresholds: {
    sface: { accept: parsed.data.SFACE_MIN_SIMILARITY, review: parsed.data.SFACE_REVIEW_SIMILARITY },
    lbph: { accept: parsed.data.LBPH_MIN_SIMILARITY, review: parsed.data.LBPH_REVIEW_SIMILARITY },
  },
} as const;

export type AppConfig = typeof config;

/** Public subset exposed to the browser (never the secret / DB url). */
export const publicConfig = {
  enrollTargetCaptures: config.enrollTargetCaptures,
  enrollMinCaptures: config.enrollMinCaptures,
  enrollStoreTopTemplates: config.enrollStoreTopTemplates,
  recognitionFramesRequired: config.recognitionFramesRequired,
  livenessMinMotion: config.livenessMinMotion,
  thresholds: config.thresholds,
  allowPhotoEnrollment: config.allowPhotoEnrollment,
  faceApiModelUrl: config.faceApiModelUrl,
} as const;
