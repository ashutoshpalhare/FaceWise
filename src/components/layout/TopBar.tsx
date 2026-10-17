import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Wifi, WifiOff, Camera, Brain, RefreshCw } from 'lucide-react';
import { getEngineStatus } from '@/lib/engine';
import type { EngineInfo, EngineStatus } from '@/types';
import { useApp, type Page } from '@/context/AppContext';
import { Badge } from '@/components/ui/Badge';
import { classNames } from '@/lib/utils';

interface EngineContextValue {
  engine: EngineInfo;
  refreshEngine: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx;
}

const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Attendance analytics overview' },
  students: { title: 'Students', subtitle: 'Register and manage enrolled students' },
  monitor: { title: 'Live Monitor', subtitle: 'Real-time face recognition & attendance' },
  sessions: { title: 'Sessions', subtitle: 'Attendance session history' },
  reports: { title: 'Reports', subtitle: 'Export attendance data as CSV' },
  settings: { title: 'Settings', subtitle: 'Engine configuration & system status' },
  about: { title: 'About FaceWise', subtitle: 'Developer profile & project information' },
};

export function EngineProvider({ children }: { children: ReactNode }): ReactNode {
  const [engine, setEngine] = useState<EngineInfo>({
    status: 'checking' as EngineStatus,
    cameraAvailable: false,
    modelTrained: false,
    studentCount: 0,
    imageCount: 0,
    version: 'unknown',
  });

  const refreshEngine = useCallback(async () => {
    const info = await getEngineStatus();
    setEngine(info);
  }, []);

  useEffect(() => {
    refreshEngine();
    const interval = setInterval(refreshEngine, 15000);
    return () => clearInterval(interval);
  }, [refreshEngine]);

  return (
    <EngineContext.Provider value={{ engine, refreshEngine }}>
      {children}
    </EngineContext.Provider>
  );
}

export function TopBar(): ReactNode {
  const { currentPage } = useApp();
  const { engine, refreshEngine } = useEngine();
  const [refreshing, setRefreshing] = useState(false);

  const info = pageTitles[currentPage] ?? pageTitles.dashboard;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshEngine();
    } finally {
      setRefreshing(false);
    }
  };

  const connected = engine.status === 'connected';

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 px-6 py-4 backdrop-blur-sm">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">{info.title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{info.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-rose-400" />
            )}
            <span className="text-xs font-medium text-slate-300">
              {connected ? 'Engine Online' : 'Engine Offline'}
            </span>
          </div>
          <span className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <Camera
              className={classNames(
                'h-4 w-4',
                engine.cameraAvailable ? 'text-cyan-400' : 'text-slate-600'
              )}
            />
            <Brain
              className={classNames(
                'h-4 w-4',
                engine.modelTrained ? 'text-cyan-400' : 'text-slate-600'
              )}
            />
          </div>
          {connected && (
            <Badge tone="success" dot>
              v{engine.version}
            </Badge>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          aria-label="Refresh engine status"
        >
          <RefreshCw className={classNames('h-4 w-4', refreshing && 'animate-spin')} />
        </button>
      </div>
    </header>
  );
}
