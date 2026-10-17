export interface Student {
  id: number;
  enrollment_no: string;
  name: string;
  email: string | null;
  department: string | null;
  image_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSession {
  id: string;
  subject: string;
  status: 'active' | 'completed' | 'cancelled';
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  total_recognized: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: number;
  confidence: number | null;
  recognized_at: string;
  date: string;
  time: string;
  created_at: string;
  student?: Student;
  session?: AttendanceSession;
}

export interface StudentWithStats extends Student {
  total_present: number;
  last_seen: string | null;
}

export type EngineStatus =
  | 'connected'
  | 'disconnected'
  | 'checking'
  | 'error';

export interface EngineInfo {
  status: EngineStatus;
  cameraAvailable: boolean;
  modelTrained: boolean;
  studentCount: number;
  imageCount: number;
  version: string;
  message?: string;
}

export interface RecognitionResult {
  student_id: number;
  name: string;
  enrollment_no: string;
  confidence: number;
  recognized: boolean;
}

export interface RegisterStudentPayload {
  enrollment_no: string;
  name: string;
  email?: string;
  department?: string;
}

export interface StartSessionPayload {
  subject: string;
  duration?: number;
}
