import { type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  Radio,
  History,
  FileDown,
  Settings,
  ScanFace,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { useApp, type Page } from '@/context/AppContext';
import { classNames } from '@/lib/utils';

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
  description: string;
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Attendance analytics overview',
  },
  {
    id: 'students',
    label: 'Students',
    icon: Users,
    description: 'Register and manage students',
  },
  {
    id: 'monitor',
    label: 'Live Monitor',
    icon: Radio,
    description: 'Real-time face recognition',
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: History,
    description: 'Attendance session history',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileDown,
    description: 'Export CSV attendance data',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    description: 'Engine configuration',
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    description: 'Developer & project info',
  },
];

export function Sidebar(): ReactNode {
  const { currentPage, setPage } = useApp();

  return (
    <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/30">
          <ScanFace className="h-5 w-5 text-slate-950" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">
            FaceWise
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-cyan-500/70">
            V2 Biometric
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={classNames(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                active
                  ? 'bg-cyan-500/10 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              )}
            >
              <Icon
                className={classNames(
                  'h-5 w-5 flex-shrink-0 transition-colors',
                  active
                    ? 'text-cyan-400'
                    : 'text-slate-500 group-hover:text-slate-300'
                )}
              />
              <div className="flex flex-col items-start min-w-0">
                <span>{item.label}</span>
                <span className="text-[10px] text-slate-600 truncate w-full text-left">
                  {item.description}
                </span>
              </div>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-6 py-4">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          FaceWise V2 — Local biometric attendance. Face data never leaves your
          machine.
        </p>
        <a
          href="https://github.com/ashutoshpalhare"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[10px] text-slate-500 transition-colors hover:text-cyan-400"
        >
          Built by Ashutosh Palhare
        </a>
      </div>
    </aside>
  );
}
