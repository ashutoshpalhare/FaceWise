import { useEffect, useState, useRef, type ReactNode } from 'react';
import {
  Radio,
  Play,
  Square,
  Camera,
  Video,
  VideoOff,
  CheckCircle2,
  UserCheck,
  AlertTriangle,
  ScanFace,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  Button,
  Badge,
  useToast,
} from '@/components/ui';
import {
  startSession,
  stopSession,
  getSessionFrame,
  getCameraPreview,
  closeCamera,
} from '@/lib/engine';
import { useEngine } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import type { RecognitionResult } from '@/types';
import { classNames } from '@/lib/utils';

export function MonitorPage(): ReactNode {
  const { notify } = useToast();
  const { engine, refreshEngine } = useEngine();

  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(30);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [detections, setDetections] = useState<RecognitionResult[]>([]);
  const [recognizedList, setRecognizedList] = useState<RecognitionResult[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanup();
      if (sessionId) stopSession(sessionId).catch(() => {});
    };
  }, []);

  const handlePreview = async () => {
    if (!engine.cameraAvailable) {
      notify('Camera is not available on the engine', 'error');
      return;
    }
    setPreviewing(true);
    try {
      const result = await getCameraPreview();
      setFrame(result.frame);
      if (!result.available) {
        notify('Camera is not available', 'error');
        setPreviewing(false);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to get camera preview', 'error');
      setPreviewing(false);
    }
  };

  const handleStopPreview = async () => {
    try {
      await closeCamera();
    } catch { /* ignore */ }
    setPreviewing(false);
    setFrame(null);
  };

  const handleStart = async () => {
    if (!subject.trim()) {
      notify('Subject name is required', 'error');
      return;
    }
    if (engine.status !== 'connected') {
      notify('Python engine must be online to start a session', 'error');
      return;
    }
    if (!engine.modelTrained) {
      notify('Model must be trained before taking attendance. Go to Students > Train Model.', 'error');
      return;
    }

    setStarting(true);
    try {
      const result = await startSession({ subject: subject.trim(), duration });
      setSessionId(result.session_id);
      setActive(true);
      setRecognizedList([]);
      setDetections([]);
      setElapsed(0);
      notify(`Attendance session started for ${subject}`, 'success');

      // Start polling for frames
      intervalRef.current = setInterval(async () => {
        if (!result.session_id) return;
        try {
          const frameData = await getSessionFrame(result.session_id);
          setFrame(frameData.frame);
          setDetections(frameData.detections);

          // Add newly recognized students
          for (const det of frameData.detections) {
            if (det.recognized) {
              setRecognizedList((prev) => {
                if (prev.some((p) => p.student_id === det.student_id)) return prev;
                return [...prev, det];
              });
            }
          }
        } catch {
          /* frame fetch errors are transient */
        }
      }, 500);

      // Track elapsed time
      const startTime = Date.now();
      elapsedRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to start session', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    setStopping(true);
    cleanup();
    try {
      const result = await stopSession(sessionId);

      // Save attendance records to Supabase
      if (result.recognized.length > 0) {
        const records = result.recognized.map((r) => ({
          session_id: sessionId,
          student_id: r.student_id,
          confidence: r.confidence,
        }));
        const { error } = await supabase.from('attendance_records').insert(records);
        if (error) {
          notify(`Session ended, but failed to save some records: ${error.message}`, 'error');
        } else {
          // Update session total
          await supabase
            .from('attendance_sessions')
            .update({
              ended_at: new Date().toISOString(),
              status: 'completed',
              total_recognized: result.recognized.length,
            })
            .eq('id', sessionId);
          notify(
            `Session ended — ${result.recognized.length} students recognized`,
            'success'
          );
        }
      } else {
        await supabase
          .from('attendance_sessions')
          .update({
            ended_at: new Date().toISOString(),
            status: 'completed',
            total_recognized: 0,
          })
          .eq('id', sessionId);
        notify('Session ended — no students were recognized', 'info');
      }

      setActive(false);
      setSessionId(null);
      setFrame(null);
      setDetections([]);
      refreshEngine();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to stop session', 'error');
    } finally {
      setStopping(false);
    }
  };

  const engineOffline = engine.status !== 'connected';

  return (
    <div className="space-y-6">
      {engineOffline && (
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Python Engine Offline
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                The face recognition engine is not running. Start it with{' '}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-cyan-300">
                  python engine.py
                </code>{' '}
                in the project's <code className="text-cyan-300">python-engine/</code> directory.
                The live monitor requires the engine for real camera access and face recognition.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Camera feed */}
        <div className="lg:col-span-2">
          <Card noPadding>
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Camera Feed
                </h3>
                {active && (
                  <Badge tone="danger" dot>
                    LIVE
                  </Badge>
                )}
              </div>
              {active && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="font-mono">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                  </span>
                  <span className="text-slate-600">/ {duration}s</span>
                </div>
              )}
            </div>

            <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
              {frame ? (
                <img
                  src={`data:image/jpeg;base64,${frame}`}
                  alt="Camera feed"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center">
                  {engine.cameraAvailable ? (
                    <>
                      <Camera className="mx-auto h-12 w-12 text-slate-700" />
                      <p className="mt-3 text-sm text-slate-500">
                        {previewing
                          ? 'Loading camera...'
                          : 'Click "Preview Camera" to test the feed'}
                      </p>
                    </>
                  ) : (
                    <>
                      <VideoOff className="mx-auto h-12 w-12 text-slate-700" />
                      <p className="mt-3 text-sm text-slate-500">
                        Camera not available
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Detection overlay info */}
              {active && detections.length > 0 && (
                <div className="absolute bottom-3 left-3 flex flex-col gap-1">
                  {detections.map((det, i) => (
                    <div
                      key={i}
                      className={classNames(
                        'rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm',
                        det.recognized
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      )}
                    >
                      {det.recognized ? (
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          {det.name} ({det.confidence.toFixed(0)})
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <ScanFace className="h-3 w-3" />
                          Unknown face
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {active && (
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-300 backdrop-blur-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                    Recording
                  </div>
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="flex items-center justify-between px-6 py-4">
              {!active ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={previewing ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                  onClick={previewing ? handleStopPreview : handlePreview}
                  disabled={engineOffline}
                >
                  {previewing ? 'Stop Preview' : 'Preview Camera'}
                </Button>
              ) : (
                <span className="text-xs text-slate-500">
                  Session in progress — camera locked
                </span>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Camera className="h-3.5 w-3.5" />
                <span>
                  {engine.cameraAvailable ? 'Camera detected' : 'No camera'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Session controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Start Attendance Session"
              subtitle="Configure and begin face recognition attendance"
              icon={<Radio className="h-4 w-4" />}
            />
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Subject Name
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics 101"
                  disabled={active}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 30)}
                  min={10}
                  max={300}
                  disabled={active}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 disabled:opacity-50"
                />
              </div>

              {!active ? (
                <Button
                  className="w-full"
                  size="lg"
                  icon={<Play className="h-4 w-4" />}
                  onClick={handleStart}
                  loading={starting}
                  disabled={engineOffline || !engine.modelTrained}
                >
                  Start Session
                </Button>
              ) : (
                <Button
                  variant="danger"
                  className="w-full"
                  size="lg"
                  icon={<Square className="h-4 w-4" />}
                  onClick={handleStop}
                  loading={stopping}
                >
                  Stop & Save
                </Button>
              )}

              {engine.status === 'connected' && !engine.modelTrained && (
                <p className="text-xs text-amber-400">
                  Model not trained. Register students and train the model first.
                </p>
              )}
            </div>
          </Card>

          {/* Recognized students */}
          <Card>
            <CardHeader
              title="Recognized Students"
              subtitle={`${recognizedList.length} unique faces matched`}
              icon={<UserCheck className="h-4 w-4" />}
            />
            {recognizedList.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {active
                  ? 'Waiting for face matches...'
                  : 'No students recognized yet'}
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recognizedList.map((rec) => (
                  <div
                    key={rec.student_id}
                    className="flex items-center justify-between rounded-lg border border-slate-800/60 px-4 py-2.5 animate-in fade-in slide-in-from-left-4 duration-300"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {rec.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {rec.enrollment_no}
                        </p>
                      </div>
                    </div>
                    <Badge tone={rec.confidence < 50 ? 'success' : 'warning'}>
                      {rec.confidence.toFixed(0)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
