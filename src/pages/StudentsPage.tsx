import { useEffect, useState, type ReactNode } from 'react';
import {
  Search,
  UserPlus,
  Trash2,
  Edit3,
  Users as UsersIcon,
  Mail,
  Building2,
  Camera,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  Button,
  Badge,
  Modal,
  DataTable,
  type Column,
  useToast,
} from '@/components/ui';
import {
  fetchStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  fetchStudentRecords,
} from '@/lib/queries';
import { registerStudent, trainModel } from '@/lib/engine';
import { useEngine } from '@/components/layout/TopBar';
import type { Student, AttendanceRecord } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils';

export function StudentsPage(): ReactNode {
  const { notify } = useToast();
  const { engine } = useEngine();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<Student | null>(null);
  const [detailRecords, setDetailRecords] = useState<AttendanceRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [training, setTraining] = useState(false);

  // form state
  const [form, setForm] = useState({
    enrollment_no: '',
    name: '',
    email: '',
    department: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudents(search);
      setStudents(data);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to load students', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  const openDetail = async (student: Student) => {
    setShowDetail(student);
    setDetailLoading(true);
    try {
      const records = await fetchStudentRecords(student.id, 20);
      setDetailRecords(records);
    } catch {
      setDetailRecords([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.enrollment_no.trim() || !form.name.trim()) {
      notify('Enrollment number and name are required', 'error');
      return;
    }

    setRegistering(true);
    try {
      // Create DB record first
      const student = await createStudent({
        enrollment_no: form.enrollment_no.trim(),
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        department: form.department.trim() || undefined,
      });

      // If engine is online, capture face images
      if (engine.status === 'connected') {
        try {
          const result = await registerStudent({
            enrollment_no: form.enrollment_no.trim(),
            name: form.name.trim(),
          });
          await updateStudent(student.id, {
            image_count: result.images_captured,
          });
          notify(
            `Registered ${form.name} — ${result.images_captured} face images captured`,
            'success'
          );
        } catch (e) {
          notify(
            `Student saved to database, but face capture failed: ${e instanceof Error ? e.message : 'engine error'}`,
            'error'
          );
        }
      } else {
        notify(
          `Student saved. Start the Python engine to capture face images.`,
          'info'
        );
      }

      setShowAdd(false);
      setForm({ enrollment_no: '', name: '', email: '', department: '' });
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to register student', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const handleTrain = async () => {
    if (engine.status !== 'connected') {
      notify('Python engine must be online to train the model', 'error');
      return;
    }
    setTraining(true);
    try {
      const result = await trainModel();
      notify(`Model trained on ${result.students_trained} students`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Training failed', 'error');
    } finally {
      setTraining(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Delete ${student.name}? This removes all their attendance records.`)) return;
    try {
      await deleteStudent(student.id);
      notify(`Deleted ${student.name}`, 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to delete student', 'error');
    }
  };

  const handleToggleActive = async (student: Student) => {
    try {
      await updateStudent(student.id, { is_active: !student.is_active });
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to update student', 'error');
    }
  };

  const columns: Column<Student>[] = [
    {
      key: 'enrollment',
      header: 'Enrollment',
      render: (s) => (
        <span className="font-mono text-xs text-slate-400">{s.enrollment_no}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <button
          onClick={() => openDetail(s)}
          className="font-medium text-slate-200 hover:text-cyan-400 transition-colors"
        >
          {s.name}
        </button>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (s) => s.department || <span className="text-slate-600">—</span>,
    },
    {
      key: 'images',
      header: 'Face Images',
      render: (s) => (
        <div className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-slate-500" />
          <span className={s.image_count > 0 ? 'text-slate-300' : 'text-slate-600'}>
            {s.image_count}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge tone={s.is_active ? 'success' : 'neutral'} dot>
          {s.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'registered',
      header: 'Registered',
      render: (s) => (
        <span className="text-xs text-slate-500">{formatDate(s.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleToggleActive(s)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title={s.is_active ? 'Deactivate' : 'Activate'}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(s)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
            title="Delete student"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, enrollment, or department..."
            className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            icon={<Camera className="h-4 w-4" />}
            onClick={handleTrain}
            loading={training}
            disabled={engine.status !== 'connected'}
          >
            Train Model
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setShowAdd(true)}
          >
            Register Student
          </Button>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <UsersIcon className="h-4 w-4" />
        <span>
          {loading ? 'Loading...' : `${students.length} student${students.length !== 1 ? 's' : ''} enrolled`}
        </span>
        {engine.status === 'connected' && (
          <Badge tone="cyan" dot>
            Engine ready
          </Badge>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={students}
        rowKey={(s) => String(s.id)}
        loading={loading}
        emptyMessage="No students found. Click Register Student to add one."
      />

      {/* Add student modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Register New Student"
        subtitle="Enroll a student and capture face images for recognition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} loading={registering}>
              {engine.status === 'connected' ? 'Register & Capture Face' : 'Save Student'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Enrollment Number" required>
            <input
              type="text"
              value={form.enrollment_no}
              onChange={(e) => setForm({ ...form, enrollment_no: e.target.value })}
              placeholder="e.g. 2024001"
              className="form-input"
            />
          </FormField>
          <FormField label="Full Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Jane Doe"
              className="form-input"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@university.edu"
                className="form-input"
              />
            </FormField>
            <FormField label="Department" icon={<Building2 className="h-3.5 w-3.5" />}>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Computer Science"
                className="form-input"
              />
            </FormField>
          </div>
          {engine.status !== 'connected' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-300">
                The Python engine is offline. The student will be saved to the
                database, but face images cannot be captured. Start the engine to
                enable face enrollment.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Student detail modal */}
      <Modal
        open={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail?.name ?? ''}
        subtitle={`Enrollment: ${showDetail?.enrollment_no}`}
        size="lg"
      >
        {showDetail && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <DetailStat label="Department" value={showDetail.department || '—'} />
              <DetailStat label="Face Images" value={String(showDetail.image_count)} />
              <DetailStat label="Status" value={showDetail.is_active ? 'Active' : 'Inactive'} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailStat label="Email" value={showDetail.email || '—'} />
              <DetailStat label="Registered" value={formatDate(showDetail.created_at)} />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-200 mb-3">
                Recent Attendance
              </h4>
              {detailLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/40" />
                  ))}
                </div>
              ) : detailRecords.length === 0 ? (
                <p className="rounded-lg border border-slate-800 py-6 text-center text-sm text-slate-500">
                  No attendance records yet
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {detailRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between rounded-lg border border-slate-800/60 px-4 py-2.5"
                    >
                      <div>
                        <p className="text-sm text-slate-200">
                          {rec.session?.subject || 'Session'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(rec.recognized_at)}
                        </p>
                      </div>
                      <Badge tone="cyan">
                        {rec.confidence !== null ? `${rec.confidence.toFixed(0)} conf` : '—'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FormField({
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        {icon}
        {label}
        {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-200 truncate">{value}</p>
    </div>
  );
}
