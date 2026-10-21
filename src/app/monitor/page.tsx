"use client";

/**
 * Live monitoring — the V2 "SessionPage" rebuilt around the hardened pipeline:
 *
 *  face detect → descriptor → three-zone match policy (known/review/unknown)
 *  → temporal consensus (same identity N frames) → passive liveness gate
 *  → server re-validates threshold + session state → DB UNIQUE prevents
 *  duplicates (and survives restarts, unlike V2's in-memory set).
 *
 * Liveness = motion-energy heuristic over the face ROI; it stops a static
 * photo, not a video replay — the side panel always keeps a manual Confirm /
 * Remove control so the teacher remains the authority.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, Select, TextInput, Th, Td, TableShell, cx, fmtDateTime } from "@/components/ui";
import { apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";
import { useCamera } from "@/lib/client/useCamera";
import { initEngine, Recognizer, type EngineInfo } from "@/lib/client/recognizer";
import { grayRoi, type NormBox } from "@/lib/client/vision";
import { bestMatch, decideMatch, frameConsensus, type MatchDecision, type MatchKind, type ThresholdPair } from "@/lib/recognition/similarity";
import { evaluateLiveness, frameMotionEnergy } from "@/lib/recognition/liveness";

interface RosterStudent {
  id: string;
  fullName: string;
  enrollmentNo: string;
  kind: string | null;
  templates: Array<{ kind: string; vector: number[]; quality: number }>;
}

interface SessionRow {
  id: string;
  title: string;
  status: "open" | "closed";
  autoRecord: boolean;
  classLabel: string | null;
  startedAt: string;
  recordCount: number;
}

interface Track {
  id: number;
  box: NormBox;
  recent: MatchDecision[];
  gray: Float32Array | null;
  motion: number[];
  status: MatchDecision["status"];
  score: number;
  studentId: string | null;
  livenessPass: boolean;
}

interface RecordedRow {
  studentId: string;
  fullName: string;
  confidence: number | null;
  method: "auto" | "manual";
  at: string;
}

interface PublicCfg {
  thresholds: { sface: ThresholdPair; lbph: ThresholdPair };
  recognitionFramesRequired: number;
  livenessMinMotion: number;
  faceApiModelUrl: string;
}

let nextTrackId = 1;

export default function MonitorPage() {
  return (
    <AppShell>
      <Monitor />
    </AppShell>
  );
}

function Monitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state: cam, start: camStart, stop: camStop } = useCamera(videoRef);

  const [cfg, setCfg] = useState<PublicCfg | null>(null);
  const [engine, setEngine] = useState<Recognizer | null>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recorded, setRecorded] = useState<RecordedRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Array<{ studentId: string; fullName: string; score: number }>>([]);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const recordedRef = useRef<Set<string>>(new Set());

  const session = sessions.find((s) => s.id === sessionId) ?? null;

  const load = useCallback(async () => {
    try {
      const [c, s, t] = await Promise.all([
        apiGet<PublicCfg>("/api/config"),
        apiGet<{ sessions: SessionRow[] }>("/api/sessions"),
        apiGet<{ students: RosterStudent[] }>("/api/templates"),
      ]);
      setCfg(c);
      setSessions(s.sessions);
      setRoster(t.students);
      const open = s.sessions.find((x) => x.status === "open");
      if (open) setSessionId(open.id);
    } catch (err) {
      setFatal(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await apiGet<PublicCfg>("/api/config");
        if (!alive) return;
        setCfg(c);
        const { engine: e, info } = await initEngine(c.faceApiModelUrl);
        if (!alive) return;
        setEngine(e);
        setEngineInfo(info);
      } catch (err) {
        alive && setFatal(errorMessage(err));
      }
    })();
    void load();
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    if (running) {
      loopRef.current = setInterval(() => void runTick(), 230);
    }
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
      loopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, engine, cfg, sessionId, roster]);

  async function createAndUse() {
    try {
      const title = newTitle.trim() || `Attendance ${new Date().toLocaleDateString()}`;
      const r = await apiPost<{ session: SessionRow }>("/api/sessions", { title, autoRecord: true });
      setSessions((s) => [r.session, ...s]);
      setSessionId(r.session.id);
      setBanner(null);
    } catch (err) {
      setBanner(errorMessage(err));
    }
  }

  async function closeSession() {
    if (!session) return;
    try {
      await apiPatch(`/api/sessions/${session.id}`, { action: "close" });
      await load();
      setRunning(false);
    } catch (err) {
      setBanner(errorMessage(err));
    }
  }

  async function runTick() {
    const video = videoRef.current;
    if (!video || !engine || !cfg || busyRef.current || cam.status !== "live") return;
    if (!session || session.status !== "open") return;
    busyRef.current = true;
    try {
      const faces = await engine.detect(video);
      const recordedIds = recordedRef.current;
      const prevTracks = tracksRef.current;
      const used = new Set<number>();
      const next: Track[] = [];

      for (const face of faces) {
        const kind: MatchKind = face.kind;
        const thresholds = kind === "sface128" ? cfg.thresholds.sface : cfg.thresholds.lbph;
        const rosterForKind = roster
          .map((s) => ({ studentId: s.id, templates: s.templates.filter((t) => t.kind === kind).map((t) => t.vector) }))
          .filter((s) => s.templates.length > 0);
        const { best, runnerUp } = bestMatch(face.embedding, rosterForKind, kind);
        const decision = decideMatch(kind, thresholds, best, runnerUp);

        // association by IoU with previous track
        let track = prevTracks.find((t) => !used.has(t.id) && iou(t.box, face.box) > 0.25) ?? null;
        if (track) used.add(track.id);
        const fresh: Track = track
          ? { ...track, box: face.box, recent: [...track.recent, decision].slice(-5) }
          : { id: nextTrackId++, box: face.box, recent: [decision], gray: null, motion: [], status: decision.status, score: 0, studentId: null, livenessPass: false };

        const gray = grayRoi(video, face.box);
        fresh.motion = track ? [...track.motion, track.gray ? frameMotionEnergy(track.gray, gray) : 0].slice(-8) : [0];
        fresh.gray = gray;
        const live = evaluateLiveness(fresh.motion, cfg.livenessMinMotion);

        const consensus = frameConsensus(fresh.recent, cfg.recognitionFramesRequired);
        fresh.status = consensus ? "known" : decision.status === "review" ? "review" : "unknown";
        fresh.score = decision.score;
        fresh.studentId = decision.studentId;
        fresh.livenessPass = live.pass;
        next.push(fresh);

        if (consensus && consensus.status === "known" && consensus.studentId && session.autoRecord && live.pass && !recordedIds.has(consensus.studentId)) {
          recordedIds.add(consensus.studentId);
          const student = roster.find((s) => s.id === consensus.studentId);
          try {
            const res = await apiPost<{ duplicate?: boolean }>("/api/sessions/" + session.id + "/records", {
              studentId: consensus.studentId,
              method: "auto",
              confidence: Math.round(consensus.score * 1000) / 1000,
              matchedVia: kind === "sface128" ? "sface" : "lbph",
              livenessScore: Math.round(live.score * 1000) / 1000,
            });
            recordedRef.current.add(consensus.studentId!);
            setRecorded((r) => [
              { studentId: consensus.studentId!, fullName: student?.fullName ?? "?", confidence: consensus.score, method: "auto", at: new Date().toISOString() },
              ...r.filter((x) => x.studentId !== consensus.studentId),
            ]);
            if (!res.duplicate) setBanner(null);
          } catch (err) {
            const msg = errorMessage(err);
            if (msg.includes("confidence")) {
              setReviewQueue((q) => (q.some((x) => x.studentId === consensus.studentId) ? q : [...q, { studentId: consensus.studentId!, fullName: student?.fullName ?? "?", score: consensus.score }]));
            } else {
              setBanner(msg);
            }
          }
        }
      }

      setTracks(next);
      tracksRef.current = next;
    } finally {
      busyRef.current = false;
    }
  }

  const tracksRef = useRef<Track[]>([]);

  async function confirmManual(studentId: string) {
    if (!session) return;
    try {
      await apiPost(`/api/sessions/${session.id}/records`, { studentId, method: "manual", matchedVia: "manual" });
      const student = roster.find((s) => s.id === studentId);
      setRecorded((r) => [{ studentId, fullName: student?.fullName ?? "?", confidence: null, method: "manual", at: new Date().toISOString() }, ...r.filter((x) => x.studentId !== studentId)]);
      setReviewQueue((q) => q.filter((x) => x.studentId !== studentId));
    } catch (err) {
      setBanner(errorMessage(err));
    }
  }

  const nameFor = (id: string | null) => roster.find((s) => s.id === id)?.fullName ?? "Unknown";

  return (
    <>
      <PageHeader
        title="Live monitor"
        subtitle="Recognition runs on-device; the server only ever receives student id + confidence."
        actions={
          <div className="flex items-center gap-2">
            {engineInfo && <Badge tone={engineInfo.mode === "sface" ? "ok" : "warn"}>{engineInfo.mode === "sface" ? "SFace 128-d" : "LBPH fallback"}</Badge>}
            <Badge tone={session?.status === "open" ? "ok" : "bad"}>{session ? `${session.title} · ${session.status}` : "no session"}</Badge>
          </div>
        }
      />

      {fatal && <div className="mb-4"><ErrorState message={fatal} onRetry={() => { setFatal(null); void load(); }} /></div>}
      {banner && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss banner" className="text-amber-200 hover:text-white">✕</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" aria-label="Camera and recognition view">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Live camera feed with recognition overlays" />
            {cam.status !== "live" && (
              <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
                {cam.status === "starting" ? "Requesting camera…" : "Start the camera to begin monitoring."}
              </div>
            )}
            {cam.status === "live" &&
              tracks.map((t) => {
                const color =
                  t.status === "known" && t.livenessPass ? "border-emerald-400" : t.status === "known" ? "border-amber-400" : t.status === "review" ? "border-amber-400" : "border-rose-500";
                const chip =
                  t.status === "known" && t.livenessPass ? "bg-emerald-500/90 text-slate-950" : t.status === "known" ? "bg-amber-500/90 text-slate-950" : t.status === "review" ? "bg-amber-500/90 text-slate-950" : "bg-rose-600/90 text-white";
                return (
                  <div key={t.id} aria-hidden className={cx("pointer-events-none absolute rounded-lg border-2", color)} style={{ left: `${t.box.x * 100}%`, top: `${t.box.y * 100}%`, width: `${t.box.width * 100}%`, height: `${t.box.height * 100}%` }}>
                    <span className={cx("absolute -top-7 left-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold", chip)}>
                      {t.status === "unknown" ? "Unknown face" : `${nameFor(t.studentId)} · ${(t.score * 100).toFixed(0)}%${t.status === "known" && !t.livenessPass ? " · no liveness" : t.status === "review" ? " · confirm?" : ""}`}
                    </span>
                  </div>
                );
              })}
          </div>
          {cam.error && <div className="mt-3"><ErrorState message={cam.error} /></div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {cam.status !== "live" ? (
              <Button onClick={() => void camStart()} busy={cam.status === "starting"}>Start camera</Button>
            ) : (
              <>
                {!running ? (
                  <Button onClick={() => setRunning(true)} disabled={!session || session.status !== "open"}>Start recognition loop</Button>
                ) : (
                  <Button variant="danger" onClick={() => setRunning(false)}>Pause loop</Button>
                )}
                <Button variant="ghost" onClick={() => { setRunning(false); camStop(); }}>Turn off camera</Button>
              </>
            )}
          </div>
          {engineInfo?.mode === "lbph" && (
            <p className="mt-2 text-xs text-amber-300/90">
              Fallback mode is active — matching uses texture histograms; accuracy is lower than SFace. Review-band confirmations are strongly recommended.
            </p>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card aria-label="Session control">
            <h2 className="mb-3 font-bold text-slate-100">Session</h2>
            {sessions.filter((s) => s.status === "open").length === 0 ? (
              <div className="space-y-2">
                <Field label="New session title">
                  {(p) => <TextInput {...p} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={`Attendance ${new Date().toLocaleDateString()}`} />}
                </Field>
                <Button onClick={() => void createAndUse()}>Open session</Button>
                <p className="text-xs text-slate-500">A session groups one class period; attendance can only be recorded while it is open.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Active session">
                  {(p) => (
                    <Select {...p} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                      {sessions.filter((s) => s.status === "open").map((s) => (
                        <option key={s.id} value={s.id}>{s.title}{s.classLabel ? ` · ${s.classLabel}` : ""}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="flex gap-2">
                  {session?.autoRecord ? <Badge tone="ok">auto-record on</Badge> : <Badge tone="warn">manual mode</Badge>}
                  <Button variant="outline" onClick={() => void closeSession()}>Close session</Button>
                </div>
              </div>
            )}
          </Card>

          <Card aria-label="Recognized students">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold text-slate-100">Present ({recorded.length})</h2>
              <span className="text-xs text-slate-500">{roster.length} enrolled faces</span>
            </div>
            {recorded.length === 0 ? (
              <EmptyState title="Waiting for recognitions" message="Recognized students appear here the moment consensus + liveness pass." />
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {recorded.map((r) => (
                  <li key={r.studentId} className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-200">{r.fullName}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {r.confidence !== null ? `${(r.confidence * 100).toFixed(0)}%` : "manual"} · {fmtDateTime(r.at)}
                      <button
                        aria-label={`Remove ${r.fullName}`}
                        className="text-slate-600 hover:text-rose-400"
                        onClick={async () => {
                          try {
                            await fetch(`/api/sessions/${session?.id}/records`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: r.studentId }) });
                            recordedRef.current.delete(r.studentId);
                          setRecorded((list) => list.filter((x) => x.studentId !== r.studentId));
                          } catch {
                            setBanner("Removal failed — check the session.");
                          }
                        }}
                      >✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {reviewQueue.length > 0 && (
            <Card aria-label="Needs confirmation">
              <h2 className="mb-2 font-bold text-amber-300">Needs confirmation ({reviewQueue.length})</h2>
              <TableShell head={<tr><Th>Student</Th><Th>Score</Th><Th></Th></tr>}>
                {reviewQueue.map((r) => (
                  <tr key={r.studentId}>
                    <Td>{r.fullName}</Td>
                    <Td>{(r.score * 100).toFixed(0)}%</Td>
                    <Td><Button variant="outline" onClick={() => void confirmManual(r.studentId)}>Confirm</Button></Td>
                  </tr>
                ))}
              </TableShell>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function iou(a: NormBox, b: NormBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}
