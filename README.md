# FaceWise V2 — Biometric Attendance Dashboard

> A premium, responsive web dashboard integrated with a Python + OpenCV face-recognition attendance system.

FaceWise V2 upgrades the original [FaceWise](https://github.com/ashutoshpalhare/FaceWise) desktop app into a modern web-based dashboard while preserving the core biometric engine — Haar cascade face detection, LBPH face recognition, training image management, and attendance logging.

## What's New in V2

| Feature | V1 (Original) | V2 (This Version) |
|---------|---------------|-------------------|
| Interface | Tkinter desktop GUI | Responsive web dashboard (dark theme) |
| Architecture | Monolithic Python script | React frontend + Flask API engine |
| Data storage | Local CSV files only | Supabase database + local biometric files |
| Analytics | None | Charts, trends, subject distribution |
| Live monitoring | OpenCV window | Real-time web camera feed with overlays |
| Reports | Manual CSV viewing | Date-range filtered CSV export |
| Student management | Basic registration | Full CRUD with search and detail views |
| Privacy | All data local | Face data stays local; only attendance results cloud-synced |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Web Dashboard                          │
│            (React + Vite + Tailwind CSS)                  │
│                                                          │
│  Dashboard  │  Students  │  Live Monitor  │  Sessions    │
│  Reports    │  Settings                                  │
└──────┬───────────────────────────────────┬──────────────┘
       │                                   │
       │  Supabase (attendance data)       │  HTTP API (face operations)
       │                                   │
       ▼                                   ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│    Supabase DB        │    │     Python Engine (Flask)     │
│                      │    │                              │
│  students            │    │  • Haar cascade detection    │
│  attendance_sessions │    │  • LBPH face recognizer      │
│  attendance_records  │    │  • Camera management         │
│                      │    │  • Training image storage    │
└──────────────────────┘    └──────────────────────────────┘
```

**Key principle:** Face images and the biometric model never leave the local machine. Only attendance results (student ID, timestamp, confidence score) are stored in the cloud database.

## Project Structure

```
facewise-v2/
├── src/                        # Web dashboard (React + TypeScript)
│   ├── components/
│   │   ├── layout/             # Sidebar, TopBar, engine status
│   │   └── ui/                 # Card, Button, Badge, Modal, Charts, etc.
│   ├── context/                # App-wide state (page routing, engine)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client singleton
│   │   ├── engine.ts           # Python engine API client
│   │   ├── queries.ts          # Database query functions
│   │   └── utils.ts            # Formatting and helper utilities
│   ├── pages/
│   │   ├── DashboardPage.tsx   # Analytics overview with charts
│   │   ├── StudentsPage.tsx    # Student registration and management
│   │   ├── MonitorPage.tsx     # Live camera feed with face recognition
│   │   ├── SessionsPage.tsx    # Session history with detail view
│   │   ├── ReportsPage.tsx     # Date-range CSV export
│   │   └── SettingsPage.tsx    # Engine config, privacy info, quick start
│   └── types/                  # TypeScript type definitions
├── python-engine/              # Python Flask API server
│   ├── engine.py               # Main engine — wraps OpenCV logic
│   └── requirements.txt        # Python dependencies
├── supabase/                   # Database migrations
└── package.json                # Frontend dependencies
```

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+
- **A webcam** connected to the machine running the Python engine
- **OpenCV system dependencies** (on Linux: `libgl1`, `libglib2.0-0`)

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Python Engine Dependencies

```bash
cd python-engine
pip install -r requirements.txt
```

### 3. Start the Python Engine

```bash
cd python-engine
python engine.py
```

You should see:
```
FaceWise V2 Engine v2.0.0
  Training images: .../python-engine/TrainingImage
  Model path:      .../python-engine/TrainingImageLabel/Trainer.yml
  Student details: .../python-engine/StudentDetails/studentdetails.csv
  Starting on http://localhost:5000
```

### 4. Start the Web Dashboard

```bash
npm run dev
```

The dashboard opens in your browser. The top bar shows **Engine Online** with a green indicator when the Python engine is reachable.

## How to Use

### Register Students

1. Go to **Students** in the sidebar.
2. Click **Register Student**.
3. Enter enrollment number, name, and optional email/department.
4. If the engine is online, the webcam activates and captures 50 face images automatically.
5. Images are stored locally in `python-engine/TrainingImage/<id>_<name>/`.

### Train the Model

1. On the **Students** page, click **Train Model**.
2. The engine processes all captured images and creates an LBPH recognizer model.
3. The model is saved as `python-engine/TrainingImageLabel/Trainer.yml`.
4. The top bar's brain icon turns cyan when the model is trained.

### Take Attendance

1. Go to **Live Monitor**.
2. Enter a subject name (e.g., "Mathematics 101").
3. Set the session duration (default: 30 seconds).
4. Click **Start Session**.
5. The camera feed appears with real-time face detection overlays:
   - Green boxes for recognized students
   - Red boxes for unknown faces
6. Recognized students appear in the side panel.
7. Click **Stop & Save** to end the session.
8. Attendance records are saved to the database automatically.

### View Session History

1. Go to **Sessions**.
2. Browse all past attendance sessions.
3. Click any session to see which students were recognized and their confidence scores.
4. Export individual sessions as CSV.

### Generate Reports

1. Go to **Reports**.
2. Select a date range.
3. Optionally filter by subject.
4. Click **Export Attendance Records** for detailed records.
5. Click **Export Student Summary** for a per-student overview.

### Dashboard Analytics

The **Dashboard** provides:
- Total/active student counts
- Today's attendance and session counts
- Weekly attendance trend bar chart
- Subject-wise attendance donut chart
- Recent session list

## API Reference

The Python engine exposes these endpoints on `http://localhost:5000`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Engine status, camera, model, student count |
| GET | `/api/health` | Simple health check |
| POST | `/api/students/register` | Register student and capture face images |
| POST | `/api/train` | Train LBPH model from captured images |
| GET | `/api/students` | List all registered students |
| GET | `/api/camera/preview` | Get a single camera frame |
| POST | `/api/camera/close` | Release the camera |
| POST | `/api/session/start` | Start an attendance recognition session |
| GET | `/api/session/<id>/frame` | Get latest frame and detections |
| POST | `/api/session/<id>/stop` | Stop session and return recognized list |

## Database Schema

### students
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Numeric ID (used as LBPH label) |
| enrollment_no | text | Unique enrollment number |
| name | text | Student full name |
| email | text | Contact email |
| department | text | Department or class |
| image_count | int | Training images captured |
| is_active | boolean | Active/inactive status |
| created_at | timestamptz | Registration date |

### attendance_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Session ID |
| subject | text | Subject name |
| status | text | active / completed / cancelled |
| started_at | timestamptz | Session start time |
| ended_at | timestamptz | Session end time |
| duration_seconds | int | Session duration |
| total_recognized | int | Unique students recognized |

### attendance_records
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Record ID |
| session_id | uuid | FK to sessions |
| student_id | int | FK to students |
| confidence | real | LBPH confidence (lower = better) |
| recognized_at | timestamptz | Match timestamp |
| date | date | Date for quick filtering |
| time | text | Time string HH:MM:SS |

All tables have Row Level Security enabled with anon-access policies (single-tenant local deployment).

## Privacy & Biometric Data

FaceWise V2 is designed with biometric privacy as a first concern:

- **Face images** are stored locally in `python-engine/TrainingImage/` — never uploaded.
- **The LBPH model** (`Trainer.yml`) is stored locally alongside the engine.
- **Only attendance results** (student ID, timestamp, confidence score) are synced to the cloud database.
- **Camera access** is handled exclusively by the Python engine — the web dashboard never directly accesses the camera.
- **No third-party APIs** are called with face data.

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Lucide React icons
- Supabase JS client

### Backend (Python Engine)
- Flask 3
- OpenCV (with contrib modules for LBPH)
- NumPy
- Pillow

### Database
- Supabase (PostgreSQL) with Row Level Security

## Preserved V1 Logic

The following core algorithms from the original FaceWise are preserved in the Python engine:

1. **Haar cascade face detection** — `cv2.CascadeClassifier(haarcascade_frontalface_default.xml)` with scale factor 1.2 and min neighbors 5.
2. **LBPH face recognition** — `cv2.face.LBPHFaceRecognizer_create()` with confidence threshold 70.
3. **Training image storage** — Images saved as grayscale face crops in `TrainingImage/<id>_<name>/`.
4. **Student details CSV** — `StudentDetails/studentdetails.csv` with ID, Enrollment, Name columns.
5. **Model training** — Iterates over all student directories, reads grayscale images, trains recognizer, saves as `Trainer.yml`.

## Troubleshooting

### Engine shows "Offline"
- Ensure the Python engine is running: `python engine-engine/engine.py`
- Check that port 5000 is not in use by another process
- Verify the engine URL in Settings matches the actual address

### Camera not available
- Ensure no other application is using the webcam
- On Linux, check permissions: `ls -la /dev/video*`
- Try `python -c "import cv2; print(cv2.VideoCapture(0).isOpened())"`

### Model not trained
- Register at least one student with face images first
- Click "Train Model" on the Students page
- Check that `TrainingImageLabel/Trainer.yml` exists after training

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Run `npm run typecheck` to check for TypeScript errors
- Ensure Node.js 18+ is installed

## License

This project builds upon the original FaceWise by [Ashutosh Palhare](https://github.com/ashutoshpalhare/FaceWise).

## Credits

- Original FaceWise: [ashutoshpalhare](https://github.com/ashutoshpalhare/FaceWise)
- Original inspiration: [Patelrahul4884](https://github.com/Patelrahul4884)
- OpenCV face recognition: the OpenCV community
