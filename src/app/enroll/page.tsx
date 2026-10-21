"use client";

/**
 * Student registration — the V2 "50 snapshots" flow, rebuilt:
 *   camera → per-frame quality gates (brightness/blur/framing) → accepted
 *   captures carry a descriptor (SFace 128-d when the neural model loads,
 *   otherwise the validated LBPH 944-d fallback) → top-N by quality are sent
 *   to the server; raw frames are discarded client-side and never leave.
 * Fallbacks for environments without a camera: photo-file enrollment and
 * manual (no-biometrics) registration, both clearly labelled.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, ErrorState, Field, PageHeader, ProgressBar, Select, TextInput, useToast, cx } from "@/components/ui";
import { apiGet, apiPost, errorMessage } from "@/lib/client/api";
import { useCamera } from "@/lib/client/useCamera";
import { initEngine, Recognizer, type EngineInfo } from "@/lib/client/recognizer";
import { cropFace } from "@/lib/client/vision";
import { assessRgbaFace, QUALITY_LIMITS } from "@/lib/recognition/quality";
import { computeLbphDescriptor } from "@/lib/recognition/lbph";

interface StoredCapture {
  kind: "sface128" | "lbph944";
  vector: number[];
  quality: number;
}

interface PublicCfg {
  enrollTargetCaptures: number;
  enrollMinCaptures: number;
  enrollStoreTopTemplates: number;
  allowPhotoEnrollment: boolean;
  faceApiModelUrl: string;
}

type Mode = "camera" | "photos" | "manual";

export default function EnrollPage() {
  return (
    <AppShell>
      <Enroll />
    </AppShell>
  );
}

function Enroll() {
  const toast = useToast();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state: cam, devices, start: camStart, stop: camStop } = useCamera(videoRef);

  const [cfg, setCfg] = useState<PublicCfg | null>(null);
  const [engine, setEngine] = useState<Recognizer | null>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("camera");
  const [form, setForm] = useState({ fullName: "", enrollmentNo: "", email: "", classLabel: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [captures, setCaptures] = useState<StoredCapture[]>([]);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [meters, setMeters] = useState({ brightness: 0, sharpness: 0 });
  const [saving, setSaving] = useState(false);
  const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Engine boot
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await apiGet<PublicCfg & { ok: boolean }>("/api/config");
        if (!alive) return;
        setCfg(c);
        const { engine: e, info } = await initEngine(c.faceApiModelUrl);
        if (!alive) return;
        setEngine(e);
        setEngineInfo(info);
      } catch (err) {
        alive && setEngineError(errorMessage(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const target = cfg?.enrollTargetCaptures ?? 50;
  const minCap = cfg?.enrollMinCaptures ?? 12;

  const stopCapture = useCallback(() => {
    setCapturing(false);
    if (captureTimer.current) {
      clearInterval(captureTimer.current);
      captureTimer.current = null;
    }
  }, []);

  // Capture loop
  useEffect(() => {
    if (!capturing || !engine || cam.status !== "live") return;
    const tick = async () => {
      const video = videoRef.current;
      if (!video || !engine) return;
      try {
        const faces = await engine.detect(video);
        if (faces.length === 0) {
          setLiveNote("No face detected — center yourself in the oval guide.");
          return;
        }
        if (faces.length > 1) {
          setLiveNote("Multiple faces detected — ask others to step out of frame.");
          return;
        }
        const face = faces[0]!;
        const crop = cropFace(video, face.box, 160);
        const facePx = Math.round(face.box.width * video.videoWidth);
        const q = assessRgbaFace(crop.data, crop.width, crop.height, facePx);
        setMeters({ brightness: q.brightness / 255, sharpness: Math.min(1, q.sharpness / 300) });
        if (q.rejectReason) {
          setLiveNote(q.rejectReason);
          return;
        }
        const vector =
          face.kind === "sface128" ? face.embedding : computeLbphDescriptor(crop.data, crop.width, crop.height);
        setCaptures((prev) => {
          const next = [...prev, { kind: face.kind, vector: Array.from(vector, (v) => Math.round(v * 1e5) / 1e5), quality: q.score }];
          return next;
        });
        setLiveNote(`Accepted capture · quality ${(q.score * 100).toFixed(0)}%`);
      } catch {
        setLiveNote("Frame processing error — retrying…");
      }
    };
    captureTimer.current = setInterval(() => void tick(), 260);
    return () => {
      if (captureTimer.current) clearInterval(captureTimer.current);
      captureTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, engine, cam.status]);

  useEffect(() => {
    if (cfg && captures.length >= target) {
      stopCapture();
      toast.push("ok", `Target reached — ${captures.length} quality-checked captures.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captures.length, cfg, target, stopCapture, toast]);

  // Photo mode processing
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  const processPhotos = useCallback(async () => {
    if (!engine) return;
    setPhotoNote("Processing images…");
    const accepted: StoredCapture[] = [];
    for (const file of photoFiles) {
      try {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.decoding = "async";
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("decode"));
          img.src = url;
        });
        const faces = await engine.detect(img);
        URL.revokeObjectURL(url);
        if (faces.length !== 1) {
          accepted.push(); // skip; counted below via note
          continue;
        }
        const face = faces[0]!;
        const crop = cropFace(img, face.box, 160);
        const facePx = Math.round(face.box.width * img.naturalWidth);
        const q = assessRgbaFace(crop.data, crop.width, crop.height, facePx);
        if (q.rejectReason) continue;
        const vector = face.kind === "sface128" ? face.embedding : computeLbphDescriptor(crop.data, crop.width, crop.height);
        accepted.push({ kind: face.kind, vector: Array.from(vector, (v) => Math.round(v * 1e5) / 1e5), quality: q.score });
      } catch {
        /* unreadable file — reported via counts */
      }
    }
    const skipped = photoFiles.length - accepted.length;
    setCaptures((prev) => [...prev, ...accepted]);
    setPhotoNote(
      accepted.length === 0
        ? "No usable faces found in those images (frontal, well-lit, decent size required)."
        : `${accepted.length} accepted, ${skipped} skipped (no clear face / poor quality).`,
    );
  }, [engine, photoFiles]);

  async function save(kind: "camera" | "photos" | "manual") {
    setFormError(null);
    if (!form.fullName.trim() || !form.enrollmentNo.trim()) {
      setFormError("Name and enrollment number are required.");
      return;
    }
    const usable = captures.filter((c) => Number.isFinite(c.quality));
    if (kind !== "manual" && usable.length < minCap) {
      setFormError(`Need at least ${minCap} quality-checked captures (you have ${usable.length}).`);
      return;
    }
    setSaving(true);
    try {
      const top = usable.sort((a, b) => b.quality - a.quality).slice(0, cfg?.enrollStoreTopTemplates ?? 10);
      await apiPost("/api/students", {
        fullName: form.fullName.trim(),
        enrollmentNo: form.enrollmentNo.trim(),
        email: form.email.trim() || null,
        classLabel: form.classLabel.trim() || null,
        templates: top,
      });
      toast.push("ok", `${form.fullName.trim()} enrolled${top.length ? ` with ${top.length} face templates` : " (manual attendance only)"}.`);
      stopCapture();
      camStop();
      router.push("/students");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Enroll student face"
        subtitle={`${target} target captures · quality-gated · images never leave this browser`}
        actions={engineInfo ? <Badge tone={engineInfo.mode === "sface" ? "ok" : "warn"}>{engineInfo.mode === "sface" ? "SFace engine" : "LBPH fallback"}</Badge> : <Badge tone="muted">engine loading</Badge>}
      />
      {engineInfo && (
        <p className={cx("mb-4 rounded-lg border px-3 py-2 text-xs", engineInfo.mode === "sface" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-amber-500/30 bg-amber-500/5 text-amber-200")}>
          {engineInfo.note}
        </p>
      )}
      {engineError && <div className="mb-4"><ErrorState message={engineError} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-label="Student details">
          <h2 className="mb-4 font-bold text-slate-100">1 · Student details</h2>
          <div className="space-y-3">
            <Field label="Full name" error={formError && !form.fullName.trim() ? "Required" : null}>
              {(p) => <TextInput {...p} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Asha Verma" maxLength={80} />}
            </Field>
            <Field label="Enrollment no." hint="3-32 chars: letters, digits, . _ -" error={formError && !form.enrollmentNo.trim() ? "Required" : null}>
              {(p) => <TextInput {...p} value={form.enrollmentNo} onChange={(e) => setForm({ ...form, enrollmentNo: e.target.value })} placeholder="CS2024-042" />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email (optional)">
                {(p) => <TextInput {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" />}
              </Field>
              <Field label="Class (optional)">
                {(p) => <TextInput {...p} value={form.classLabel} onChange={(e) => setForm({ ...form, classLabel: e.target.value })} placeholder="CS-A" maxLength={40} />}
              </Field>
            </div>
            {formError && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{formError}</p>}
          </div>

          <div className="mt-4" role="group" aria-label="Enrollment mode">
            <p className="mb-2 text-sm font-medium text-slate-300">Capture mode</p>
            <div className="flex flex-wrap gap-2">
              <ModeBtn active={mode === "camera"} onClick={() => setMode("camera")} label="Live camera" />
              {cfg?.allowPhotoEnrollment && <ModeBtn active={mode === "photos"} onClick={() => setMode("photos")} label="Photo files" />}
              <ModeBtn active={mode === "manual"} onClick={() => setMode("manual")} label="No biometrics" />
            </div>
          </div>
        </Card>

        <Card aria-label="Face capture">
          <h2 className="mb-4 font-bold text-slate-100">2 · Face capture</h2>

          {mode === "camera" && (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <video ref={videoRef} playsInline muted aria-label="Camera preview" className="h-full w-full -scale-x-100 object-cover" />
                {cam.status !== "live" && (
                  <div className="absolute inset-0 grid place-items-center text-center text-sm text-slate-500">
                    {cam.status === "starting" ? "Requesting camera…" : "Camera off — press Start below."}
                  </div>
                )}
                {cam.status === "live" && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className={cx("h-3/5 w-2/5 rounded-[50%] border-2 transition", capturing ? "border-emerald-400/80" : "border-slate-500/60")} />
                  </div>
                )}
              </div>

              {cam.error && <ErrorState message={cam.error} />}

              <div className="flex flex-wrap items-center gap-2">
                {cam.status !== "live" ? (
                  <Button onClick={() => void camStart(devices[0]?.deviceId)} busy={cam.status === "starting"}>Start camera</Button>
                ) : (
                  <>
                    {!capturing ? (
                      <Button onClick={() => { setCaptures([]); setCapturing(true); }}>Begin {target} captures</Button>
                    ) : (
                      <Button variant="danger" onClick={stopCapture}>Stop capture</Button>
                    )}
                    <Button variant="ghost" onClick={camStop}>Turn off</Button>
                  </>
                )}
                {devices.length > 1 && (
                  <Select aria-label="Camera device" className="w-auto" onChange={(e) => void camStart(e.target.value)} value={devices[0]?.deviceId ?? ""}>
                    {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                  </Select>
                )}
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Captures accepted</span>
                  <span className="font-bold text-slate-200">{captures.length}/{target}</span>
                </div>
                <ProgressBar value={captures.length / target} label="Enrollment progress" />
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <Meter label="Brightness" value={meters.brightness} goodFrom={0.15} goodTo={0.88} />
                  <Meter label="Sharpness" value={meters.sharpness} goodFrom={QUALITY_LIMITS.sharpnessMin / 300} goodTo={1} />
                </div>
                <p role="status" aria-live="polite" className="min-h-5 text-center text-xs text-slate-400">
                  {liveNote ?? (cam.status === "live" ? "Hold steady inside the guide." : "")}
                </p>
              </div>
            </div>
          )}

          {mode === "photos" && (
            <div className="space-y-3">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                aria-label="Face photos"
                onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-cyan-400"
              />
              <p className="text-xs text-slate-500">{photoFiles.length} file(s) selected — frontal, well-lit, single face each.</p>
              <Button variant="outline" onClick={() => void processPhotos()} disabled={photoFiles.length === 0 || !engine}>
                Analyze photos
              </Button>
              {photoNote && <p role="status" className="text-xs text-slate-400">{photoNote}</p>}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Accepted</span><span className="font-bold text-slate-200">{captures.length}/{target}</span>
              </div>
              <ProgressBar value={captures.length / target} label="Photo capture progress" />
            </div>
          )}

          {mode === "manual" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="font-semibold">Manual (no biometrics)</p>
              <p className="mt-1 text-amber-200/80">
                The student will be registered for <strong>manual attendance only</strong> — they never appear for auto-recognition. Use this when a camera is unavailable; re-enroll the face later from the Students page.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
            {mode === "manual" ? (
              <Button onClick={() => void save("manual")} busy={saving}>Register student</Button>
            ) : (
              <>
                <Button onClick={() => void save(mode)} busy={saving} disabled={captures.length < minCap}>
                  Save enrollment ({Math.min(captures.length, cfg?.enrollStoreTopTemplates ?? 10)} templates)
                </Button>
                {captures.length < minCap && <span className="text-xs text-slate-500">Collect at least {minCap} accepted captures first.</span>}
              </>
            )}
            <Link href="/students" className="text-sm text-slate-400 underline hover:text-slate-200">View roster</Link>
          </div>
        </Card>
      </div>
    </>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active ? "border-cyan-400 bg-cyan-500/15 text-cyan-300" : "border-slate-700 text-slate-400 hover:border-slate-500",
      )}
    >
      {label}
    </button>
  );
}

function Meter({ label, value, goodFrom, goodTo }: { label: string; value: number; goodFrom: number; goodTo: number }) {
  const inRange = value >= goodFrom && value <= goodTo;
  return (
    <div>
      <div className="mb-1 flex justify-between"><span>{label}</span><span className={inRange ? "text-emerald-300" : "text-slate-500"}>{inRange ? "ok" : "adjust"}</span></div>
      <ProgressBar value={value} label={label} />
    </div>
  );
}
