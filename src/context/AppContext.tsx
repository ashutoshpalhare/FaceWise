import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { EngineInfo } from '@/types';
import { useEngine } from '@/components/layout/TopBar';


export type Page =
  | 'dashboard'
  | 'students'
  | 'monitor'
  | 'sessions'
  | 'reports'
  | 'settings'
  | 'about';


interface AppContextValue {
  currentPage: Page;
  setPage: (page: Page) => void;
  engine: EngineInfo;
  refreshEngine: () => void;
}


const AppContext = createContext<AppContextValue | null>(null);


export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}


export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [currentPage, setPage] = useState<Page>('dashboard');
  const { engine, refreshEngine } = useEngine();


  return (
    <AppContext.Provider
      value={{ currentPage, setPage, engine, refreshEngine }}
    >
      {children}
    </AppContext.Provider>
  );
}

