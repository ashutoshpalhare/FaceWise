import { type ReactNode } from 'react';
import { EngineProvider } from '@/components/layout/TopBar';
import { AppProvider, useApp } from '@/context/AppContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ToastProvider } from '@/components/ui/Toast';
import { DashboardPage } from '@/pages/DashboardPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { MonitorPage } from '@/pages/MonitorPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage } from '@/pages/AboutPage';


function PageContent(): ReactNode {
  const { currentPage } = useApp();


  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'students':
      return <StudentsPage />;
    case 'monitor':
      return <MonitorPage />;
    case 'sessions':
      return <SessionsPage />;
    case 'reports':
      return <ReportsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'about':
      return <AboutPage />;
    default:
      return <DashboardPage />;
  }
}


function AppShell(): ReactNode {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <PageContent />
        </main>
      </div>
    </div>
  );
}


export default function App(): ReactNode {
  return (
    <ToastProvider>
      <EngineProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </EngineProvider>
    </ToastProvider>
  );
}

