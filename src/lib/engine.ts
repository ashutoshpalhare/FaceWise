import type {
  EngineInfo,
  EngineStatus,
  RecognitionResult,
  RegisterStudentPayload,
  StartSessionPayload,
} from '@/types';

/**
 * Client for the FaceWise Python engine API.
 *
 * The Python engine runs locally (Flask on port 5000) and wraps the existing
 * OpenCV face-recognition logic. The frontend never fakes recognition, camera
 * status, or attendance data — every call goes to the real engine, and if the
 * engine is unreachable, callers receive an explicit error.
 */

const DEFAULT_ENGINE_URL = 'http://localhost:5000';

function getEngineUrl(): string {
  return (
    localStorage.getItem('facewise_engine_url') || DEFAULT_ENGINE_URL
  );
}

export function setEngineUrl(url: string): void {
  localStorage.setItem('facewise_engine_url', url);
}

export function getEngineUrlValue(): string {
  return getEngineUrl();
}

async function engineFetch<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 8000
): Promise<T> {
  const base = getEngineUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body.error || `Engine request failed (${res.status})`
      );
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- Status ---- */

export async function getEngineStatus(): Promise<EngineInfo> {
  try {
    const info = await engineFetch<EngineInfo>('/api/status', undefined, 4000);
    return { ...info, status: 'connected' as EngineStatus };
  } catch {
    return {
      status: 'disconnected',
      cameraAvailable: false,
      modelTrained: false,
      studentCount: 0,
      imageCount: 0,
      version: 'unknown',
      message: 'Python engine not reachable. Start it with: python engine.py',
    };
  }
}

/* ---- Students ---- */

export async function registerStudent(
  payload: RegisterStudentPayload
): Promise<{ student_id: number; images_captured: number; message: string }> {
  return engineFetch('/api/students/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function trainModel(): Promise<{
  message: string;
  students_trained: number;
}> {
  return engineFetch(
    '/api/train',
    { method: 'POST' },
    undefined
  );
}

/* ---- Recognition / Sessions ---- */

export async function startSession(
  payload: StartSessionPayload
): Promise<{ session_id: string; message: string }> {
  return engineFetch('/api/session/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function stopSession(
  sessionId: string
): Promise<{ message: string; recognized: RecognitionResult[] }> {
  return engineFetch(`/api/session/${sessionId}/stop`, {
    method: 'POST',
  });
}

export async function getSessionFrame(
  sessionId: string
): Promise<{ frame: string; detections: RecognitionResult[] }> {
  return engineFetch(`/api/session/${sessionId}/frame`, undefined, 5000);
}

export async function getCameraPreview(): Promise<{
  frame: string;
  available: boolean;
}> {
  return engineFetch('/api/camera/preview', undefined, 5000);
}

export async function closeCamera(): Promise<{ message: string }> {
  return engineFetch('/api/camera/close', { method: 'POST' });
}
