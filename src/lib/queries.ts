import { supabase } from './supabase';
import type {
  Student,
  AttendanceSession,
  AttendanceRecord,
} from '@/types';

/* ---- Students ---- */

export async function fetchStudents(
  search?: string
): Promise<Student[]> {
  let query = supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,enrollment_no.ilike.%${search}%,department.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchStudent(id: number): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createStudent(input: {
  enrollment_no: string;
  name: string;
  email?: string;
  department?: string;
}): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStudent(
  id: number,
  input: Partial<Pick<Student, 'name' | 'email' | 'department' | 'is_active' | 'image_count'>>
): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudent(id: number): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
}

/* ---- Sessions ---- */

export async function fetchSessions(limit = 50): Promise<AttendanceSession[]> {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchSession(
  id: string
): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ---- Records ---- */

export async function fetchRecordsBySession(
  sessionId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, student:students(*)')
    .eq('session_id', sessionId)
    .order('recognized_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchRecordsByDateRange(
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, student:students(*), session:attendance_sessions(*)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('recognized_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchStudentRecords(
  studentId: number,
  limit = 20
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, session:attendance_sessions(*)')
    .eq('student_id', studentId)
    .order('recognized_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/* ---- Analytics ---- */

export async function fetchDashboardStats(): Promise<{
  totalStudents: number;
  activeStudents: number;
  totalSessions: number;
  totalRecords: number;
  todayRecords: number;
  todaySessionCount: number;
}> {
  const today = new Date().toISOString().slice(0, 10);

  const [studentsRes, activeRes, sessionsRes, recordsRes, todayRes, todaySessRes] =
    await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('date', today),
      supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', `${today}T00:00:00Z`)
        .lte('started_at', `${today}T23:59:59Z`),
    ]);

  return {
    totalStudents: studentsRes.count ?? 0,
    activeStudents: activeRes.count ?? 0,
    totalSessions: sessionsRes.count ?? 0,
    totalRecords: recordsRes.count ?? 0,
    todayRecords: todayRes.count ?? 0,
    todaySessionCount: todaySessRes.count ?? 0,
  };
}

export async function fetchWeeklyAttendance(): Promise<
  { date: string; count: number }[]
> {
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const { count, error } = await supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('date', dateStr);
    if (error) throw error;
    days.push({
      date: d.toLocaleDateString('en-US', { weekday: 'short' }),
      count: count ?? 0,
    });
  }
  return days;
}

export async function fetchSubjectDistribution(): Promise<
  { subject: string; count: number }[]
> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('session:attendance_sessions(subject)')
    .limit(500);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const subject = (row.session as unknown as { subject: string })?.subject || 'Unknown';
    map.set(subject, (map.get(subject) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export async function fetchRecentSessions(
  limit = 5
): Promise<AttendanceSession[]> {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}