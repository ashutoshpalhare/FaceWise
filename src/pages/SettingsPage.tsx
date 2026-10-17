import { useEffect, useState, type ReactNode } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Camera,
  Brain,
  Database,
  Shield,
  Save,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  Button,
  Badge,
  useToast,
} from '@/components/ui';
import { useEngine } from '@/components/layout/TopBar';
import {
  getEngineUrlValue,
  setEngineUrl,
} from '@/lib/engine';
import { supabase } from '@/lib/supabase';

export function SettingsPage(): ReactNode {
  const { notify } = useToast();
  const { engine, refreshEngine } = useEngine();
  const [engineUrl, setEngineUrlState] = useState(getEngineUrlValue());
  const [saving, setSaving] = useState(false);
  const [dbStats, setDbStats] = useState<{
    students: number;
    sessions: number;
    records: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const [s, sess, rec] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_records').select('*', { count: 'exact', head: true }),
      ]);
      setDbStats({
        students: s.count ?? 0,
        sessions: sess.count ?? 0,
        records: rec.count ?? 0,
      });
    })();
  }, []);

  const handleSave = () => {
    setSaving(true);
    try {
      setEngineUrl(engineUrl.trim());
      notify('Engine URL saved. Refreshing status...', 'success');
      refreshEngine();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const connected = engine.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Engine status */}
      <Card>
        <CardHeader
          title="Python Engine Status"
          subtitle="Face recognition engine connection and capabilities"
          icon={<Server className="h-4 w-4" />}
          action={
            <Badge tone={connected ? 'success' : 'danger'} dot>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          }
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatusItem
            label="Camera"
            value={engine.cameraAvailable ? 'Available' : 'Not Found'}
            ok={engine.cameraAvailable}
            icon={<Camera className="h-4 w-4" />}
          />
          <StatusItem
            label="Model"
            value={engine.modelTrained ? 'Trained' : 'Not Trained'}
            ok={engine.modelTrained}
            icon={<Brain className="h-4 w-4" />}
          />
          <StatusItem
            label="Students"
            value={String(engine.studentCount)}
            ok={engine.studentCount > 0}
            icon={<Database className="h-4 w-4" />}
          />
          <StatusItem
            label="Version"
            value={engine.version}
            ok={connected}
            icon={<Info className="h-4 w-4" />}
          />
        </div>
        {!connected && engine.message && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-amber-300">{engine.message}</p>
          </div>
        )}
      </Card>

      {/* Engine URL configuration */}
      <Card>
        <CardHeader
          title="Engine URL"
          subtitle="Local address where the Python Flask engine is running"
          icon={<SettingsIcon className="h-4 w-4" />}
        />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Engine Address
            </label>
            <input
              type="text"
              value={engineUrl}
              onChange={(e) => setEngineUrlState(e.target.value)}
              placeholder="http://localhost:5000"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <Button
            icon={<Save className="h-4 w-4" />}
            onClick={handleSave}
            loading={saving}
          >
            Save
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Default is <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300">http://localhost:5000</code>.
          Change this if you run the Python engine on a different port or machine.
        </p>
      </Card>

      {/* Database info */}
      <Card>
        <CardHeader
          title="Database"
          subtitle="Supabase backend storage statistics"
          icon={<Database className="h-4 w-4" />}
        />
        <div className="grid grid-cols-3 gap-4">
          <DbStat label="Students" value={dbStats?.students ?? '—'} />
          <DbStat label="Sessions" value={dbStats?.sessions ?? '—'} />
          <DbStat label="Records" value={dbStats?.records ?? '—'} />
        </div>
      </Card>

      {/* Privacy & security */}
      <Card>
        <CardHeader
          title="Privacy & Biometric Data"
          subtitle="How FaceWise V2 handles sensitive face data"
          icon={<Shield className="h-4 w-4" />}
        />
        <div className="space-y-3">
          <PrivacyItem
            text="Face training images are stored locally on the machine running the Python engine — never uploaded to the cloud."
          />
          <PrivacyItem
            text="The LBPH recognizer model (Trainner.yml) is stored locally alongside the engine."
          />
          <PrivacyItem
            text="Only attendance results (student ID, timestamp, confidence) are synced to the database — no biometric data leaves your machine."
          />
          <PrivacyItem
            text="All camera access is handled by the Python engine on the local machine — the web dashboard never directly accesses the camera."
          />
        </div>
      </Card>

      {/* Quick start guide */}
      <Card>
        <CardHeader
          title="Quick Start Guide"
          subtitle="How to run FaceWise V2 locally"
          icon={<Info className="h-4 w-4" />}
        />
        <div className="space-y-4 text-sm text-slate-300">
          <Step
            num={1}
            title="Install Python dependencies"
            cmd="cd python-engine && pip install -r requirements.txt"
          />
          <Step
            num={2}
            title="Start the Python engine"
            cmd="python engine.py"
          />
          <Step
            num={3}
            title="Register students"
            text="Go to the Students page and click Register Student. The engine will capture face images via the webcam."
          />
          <Step
            num={4}
            title="Train the model"
            text="Click Train Model on the Students page. This creates the LBPH recognizer from captured images."
          />
          <Step
            num={5}
            title="Take attendance"
            text="Go to Live Monitor, enter a subject, and start a session. The engine recognizes faces in real-time."
          />
          <Step
            num={6}
            title="View and export"
            text="Check Sessions for history and Reports for CSV exports."
          />
        </div>
      </Card>
    </div>
  );
}

function StatusItem({
  label,
  value,
  ok,
  icon,
}: {
  label: string;
  value: string;
  ok: boolean;
  icon: ReactNode;
}): ReactNode {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-400" />
        )}
        <span className="text-sm font-medium text-slate-200">{value}</span>
      </div>
    </div>
  );
}

function DbStat({ label, value }: { label: string; value: number | string }): ReactNode {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-center">
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function PrivacyItem({ text }: { text: string }): ReactNode {
  return (
    <div className="flex items-start gap-2.5">
      <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-cyan-400/70" />
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

function Step({
  num,
  title,
  cmd,
  text,
}: {
  num: number;
  title: string;
  cmd?: string;
  text?: string;
}): ReactNode {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-400">
        {num}
      </div>
      <div className="flex-1">
        <p className="font-medium text-slate-200">{title}</p>
        {cmd && (
          <pre className="mt-1.5 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-cyan-300 overflow-x-auto">
            {cmd}
          </pre>
        )}
        {text && <p className="mt-1.5 text-sm text-slate-400">{text}</p>}
      </div>
    </div>
  );
}
