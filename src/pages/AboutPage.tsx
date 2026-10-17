import { type ReactNode } from 'react';
import {
  ScanFace,
  Shield,
  Lock,
  Eye,
  Github,
  ExternalLink,
  Code2,
  Server,
  Database,
  Cpu,
  Layers,
  CheckCircle2,
  Sparkles,
  Heart,
} from 'lucide-react';
import { Card, CardHeader, Badge } from '@/components/ui';

const GITHUB_PROFILE = 'https://github.com/ashutoshpalhare';
const GITHUB_AVATAR = 'https://avatars.githubusercontent.com/u/53346137?v=4';
const FACEWISE_REPO = 'https://github.com/ashutoshpalhare/FaceWise';

const keyFeatures = [
  'Real-time face detection using Haar cascade classifiers',
  'LBPH (Local Binary Pattern Histogram) face recognition engine',
  'Automated attendance logging with confidence scoring',
  'Student registration with multi-image face capture',
  'Supabase-backed attendance session and record storage',
  'Date-range filtered CSV report export',
  'Live camera monitoring with detection overlays',
  'Privacy-first architecture — biometric data never leaves localhost',
];

const techStack = [
  { name: 'React 18', category: 'Frontend', icon: Layers },
  { name: 'TypeScript', category: 'Frontend', icon: Code2 },
  { name: 'Tailwind CSS', category: 'Frontend', icon: Sparkles },
  { name: 'Vite', category: 'Frontend', icon: Layers },
  { name: 'Python + Flask', category: 'Engine', icon: Server },
  { name: 'OpenCV (LBPH)', category: 'Engine', icon: Cpu },
  { name: 'Supabase', category: 'Database', icon: Database },
  { name: 'PostgreSQL + RLS', category: 'Database', icon: Database },
];

const privacyPoints = [
  {
    icon: Lock,
    title: 'Local Face Storage',
    text: 'All training images and the LBPH model file are stored on the machine running the Python engine — never uploaded to any cloud service.',
  },
  {
    icon: Eye,
    title: 'No Biometric Cloud Sync',
    text: 'Only attendance results (student ID, timestamp, confidence score) are synced to the database. No face images or biometric templates leave your machine.',
  },
  {
    icon: Shield,
    title: 'Engine-Side Camera Access',
    text: 'The webcam is accessed exclusively by the local Python engine. The web dashboard communicates via HTTP API and never directly touches the camera.',
  },
];

export function AboutPage(): ReactNode {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero / Developer profile */}
      <Card noPadding className="overflow-hidden">
        <div className="relative">
          {/* Banner gradient */}
          <div className="h-32 bg-gradient-to-r from-slate-800 via-slate-900 to-cyan-950/40" />

          {/* Avatar + name */}
          <div className="px-6 pb-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:-mt-16">
              <div className="relative">
                <div className="rounded-2xl border-4 border-slate-900 bg-slate-800 overflow-hidden shadow-xl">
                  <img
                    src={GITHUB_AVATAR}
                    alt="Ashutosh Palhare"
                    className="h-28 w-28 object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 bg-emerald-500">
                  <CheckCircle2 className="h-4 w-4 text-slate-950" />
                </div>
              </div>

              <div className="flex-1 pb-1">
                <h2 className="text-2xl font-bold text-slate-100">
                  Ashutosh Palhare
                </h2>
                <p className="text-sm text-cyan-400 mt-0.5">
                  Full-Stack Developer | Cybersecurity Enthusiast
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  India · GitHub: @ashutoshpalhare
                </p>
              </div>

              {/* GitHub links */}
              <div className="flex items-center gap-3 pb-1">
                <a
                  href={GITHUB_PROFILE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800"
                >
                  <Github className="h-4 w-4" />
                  Profile
                  <ExternalLink className="h-3 w-3 text-slate-500" />
                </a>
                <a
                  href={FACEWISE_REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-all hover:border-cyan-500/50 hover:bg-cyan-500/20"
                >
                  <ScanFace className="h-4 w-4" />
                  FaceWise Repo
                  <ExternalLink className="h-3 w-3 text-cyan-500/60" />
                </a>
              </div>
            </div>

            {/* Bio */}
            <div className="mt-6 max-w-3xl">
              <p className="text-sm leading-relaxed text-slate-300">
                Ashutosh is a frontend-first full-stack developer from India
                with hands-on experience building real products. He works
                effectively with modern AI tools as an engineering multiplier —
                using them to increase speed while remaining fully responsible
                for architecture, technical decisions, and final product
                quality. His interests span web development, Python projects,
                and cybersecurity, with a focus on turning ideas into clean,
                modern, and functional applications.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="cyan">Python</Badge>
                <Badge tone="cyan">JavaScript</Badge>
                <Badge tone="cyan">TypeScript</Badge>
                <Badge tone="cyan">React</Badge>
                <Badge tone="cyan">OpenCV</Badge>
                <Badge tone="cyan">Flask</Badge>
                <Badge tone="cyan">Tailwind CSS</Badge>
                <Badge tone="cyan">Supabase</Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Project mission */}
      <Card>
        <CardHeader
          title="Project Mission"
          subtitle="What FaceWise V2 set out to achieve"
          icon={<ScanFace className="h-4 w-4" />}
        />
        <p className="text-sm leading-relaxed text-slate-300">
          FaceWise V2 transforms the original desktop-based face recognition
          attendance system into a modern web dashboard. The goal is to make
          biometric attendance accessible through a clean, responsive interface
          while keeping all sensitive face data on the local machine. The
          system preserves the proven OpenCV LBPH recognition pipeline from V1
          and adds analytics, live monitoring, searchable session history, and
          CSV reporting — all designed for local deployment where privacy is
          non-negotiable.
        </p>
      </Card>

      {/* Key features + Tech stack */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Key Features"
            subtitle="What FaceWise V2 delivers"
            icon={<Sparkles className="h-4 w-4" />}
          />
          <ul className="space-y-3">
            {keyFeatures.map((feature, i) => (
              <li
                key={i}
                className="flex items-start gap-3 animate-in fade-in slide-in-from-left-4 duration-300"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <span className="text-sm text-slate-300">{feature}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Technology Stack"
            subtitle="Tools powering FaceWise V2"
            icon={<Layers className="h-4 w-4" />}
          />
          <div className="grid grid-cols-2 gap-3">
            {techStack.map((tech, i) => {
              const Icon = tech.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 transition-colors hover:border-slate-700 animate-in fade-in zoom-in-95 duration-300"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
                    <Icon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {tech.name}
                    </p>
                    <p className="text-[10px] text-slate-500">{tech.category}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Privacy-first approach */}
      <Card>
        <CardHeader
          title="Privacy-First Approach"
          subtitle="How FaceWise V2 protects biometric data"
          icon={<Shield className="h-4 w-4" />}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {privacyPoints.map((point, i) => {
            const Icon = point.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-400"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Icon className="h-5 w-5 text-cyan-400" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-slate-100">
                  {point.title}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {point.text}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Original project credit */}
      <Card>
        <CardHeader
          title="Original Project"
          subtitle="FaceWise V1 — the foundation"
          icon={<Github className="h-4 w-4" />}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-300">
              FaceWise V2 builds upon the original FaceWise project — a Python
              and OpenCV face-based attendance system with a Tkinter desktop
              GUI. V2 preserves the core Haar cascade detection and LBPH
              recognition pipeline while upgrading the interface to a modern web
              dashboard.
            </p>
          </div>
          <a
            href={FACEWISE_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800"
          >
            <Github className="h-4 w-4" />
            View V1 Repository
            <ExternalLink className="h-3 w-3 text-slate-500" />
          </a>
        </div>
      </Card>

      {/* Built by credit */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2">
        <span className="text-xs text-slate-500">Built with</span>
        <Heart className="h-3.5 w-3.5 text-rose-400/70" />
        <span className="text-xs text-slate-500">by</span>
        <a
          href={GITHUB_PROFILE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Ashutosh Palhare
        </a>
      </div>
    </div>
  );
}
