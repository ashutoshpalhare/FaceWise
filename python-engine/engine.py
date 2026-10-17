"""
FaceWise V2 — Python Engine
============================

Flask-based API server that wraps the existing OpenCV face recognition logic
from the original FaceWise project. Provides a clean localhost REST API that
the web dashboard can communicate with.

Preserves the core architecture from FaceWise V1:
  - Haar cascade face detection (haarcascade_frontalface_default.xml)
  - LBPH face recognizer (cv2.face.LBPHFaceRecognizer_create)
  - Training image storage in TrainingImage/<id>_<name>/
  - Model saved as TrainingImageLabel/Trainer.yml
  - Student details in StudentDetails/studentdetails.csv

All face data stays on the local machine. Only attendance results
(student ID, timestamp, confidence) are sent to the Supabase database
by the web frontend.
"""

import os
import csv
import time
import datetime
import threading
import base64
import glob

import cv2
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HAARCASCADE_PATH = os.path.join(BASE_DIR, "haarcascade_frontalface_default.xml")
TRAIN_IMAGE_DIR = os.path.join(BASE_DIR, "TrainingImage")
TRAIN_LABEL_DIR = os.path.join(BASE_DIR, "TrainingImageLabel")
TRAINER_PATH = os.path.join(TRAIN_LABEL_DIR, "Trainer.yml")
STUDENT_DETAILS_DIR = os.path.join(BASE_DIR, "StudentDetails")
STUDENT_DETAILS_PATH = os.path.join(STUDENT_DETAILS_DIR, "studentdetails.csv")

# Ensure directories exist
for d in [TRAIN_IMAGE_DIR, TRAIN_LABEL_DIR, STUDENT_DETAILS_DIR]:
    os.makedirs(d, exist_ok=True)

# Download haarcascade if missing
if not os.path.exists(HAARCASCADE_PATH):
    cv2.data.haarcascades_dir = os.path.dirname(cv2.__file__) + "/data/"
    default_cascade = os.path.join(cv2.data.haarcascades_dir, "haarcascade_frontalface_default.xml")
    if os.path.exists(default_cascade):
        import shutil
        shutil.copy2(default_cascade, HAARCASCADE_PATH)

CONFIDENCE_THRESHOLD = 70  # Lower = better match (LBPH)
IMAGES_PER_STUDENT = 50
ENGINE_VERSION = "2.0.0"

app = Flask(__name__)
CORS(app)

# -------------------------------------------------------------------
# Global state (single-session model for local deployment)
# -------------------------------------------------------------------

camera_lock = threading.Lock()
camera: cv2.VideoCapture | None = None
active_session: dict | None = None
session_lock = threading.Lock()


def get_camera() -> cv2.VideoCapture | None:
    """Get or initialize the camera singleton."""
    global camera
    if camera is not None and camera.isOpened():
        return camera
    try:
        camera = cv2.VideoCapture(0)
        if camera.isOpened():
            return camera
        return None
    except Exception:
        return None


def release_camera():
    """Release the camera resource."""
    global camera
    if camera is not None:
        camera.release()
        camera = None


def encode_frame(frame) -> str:
    """Encode an OpenCV frame as base64 JPEG."""
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def read_student_details() -> list[dict]:
    """Read student details CSV, returning list of dicts."""
    if not os.path.exists(STUDENT_DETAILS_PATH):
        return []
    students = []
    with open(STUDENT_DETAILS_PATH, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            students.append(row)
    return students


def write_student_details(students: list[dict]):
    """Write student details CSV."""
    if not students:
        return
    with open(STUDENT_DETAILS_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=students[0].keys())
        writer.writeheader()
        writer.writerows(students)


def get_next_student_id() -> int:
    """Get the next available numeric student ID."""
    students = read_student_details()
    if not students:
        return 1
    max_id = max(int(s.get("ID", 0)) for s in students)
    return max_id + 1


def find_student_by_name(name: str) -> dict | None:
    """Find a student by name in the details CSV."""
    for s in read_student_details():
        if s.get("Name", "").lower() == name.lower():
            return s
    return None


def find_student_by_id(student_id: int) -> dict | None:
    """Find a student by numeric ID."""
    for s in read_student_details():
        if int(s.get("ID", 0)) == student_id:
            return s
    return None


def model_exists() -> bool:
    """Check if a trained LBPH model exists."""
    return os.path.exists(TRAINER_PATH)


# -------------------------------------------------------------------
# API Routes
# -------------------------------------------------------------------

@app.route("/api/status", methods=["GET"])
def status():
    """Return engine status, camera availability, and model info."""
    cam = get_camera()
    cam_available = cam is not None
    # Don't hold the camera just for a status check
    if cam_available and active_session is None:
        release_camera()

    students = read_student_details()

    # Count training images
    image_count = 0
    if os.path.exists(TRAIN_IMAGE_DIR):
        for root, dirs, files in os.walk(TRAIN_IMAGE_DIR):
            image_count += len([f for f in files if f.endswith((".jpg", ".png"))])

    return jsonify({
        "status": "connected",
        "cameraAvailable": cam_available,
        "modelTrained": model_exists(),
        "studentCount": len(students),
        "imageCount": image_count,
        "version": ENGINE_VERSION,
    })


@app.route("/api/students/register", methods=["POST"])
def register_student():
    """
    Register a new student and capture face training images.
    Preserves the original TakeImage logic: detect face with Haar cascade,
    capture up to IMAGES_PER_STUDENT frames, save to TrainingImage/<id>_<name>/.
    """
    data = request.get_json() or {}
    enrollment_no = data.get("enrollment_no", "").strip()
    name = data.get("name", "").strip()

    if not enrollment_no or not name:
        return jsonify({"error": "enrollment_no and name are required"}), 400

    # Check if student already exists
    existing = find_student_by_name(name)
    if existing:
        return jsonify({"error": f"Student '{name}' already exists"}), 409

    student_id = get_next_student_id()

    # Append to student details CSV
    students = read_student_details()
    students.append({
        "ID": str(student_id),
        "Enrollment": enrollment_no,
        "Name": name,
    })
    write_student_details(students)

    # Capture face images
    cam = get_camera()
    if cam is None:
        return jsonify({
            "student_id": student_id,
            "images_captured": 0,
            "message": "Student registered but camera not available for face capture",
        })

    face_cascade = cv2.CascadeClassifier(HAARCASCADE_PATH)
    student_dir = os.path.join(TRAIN_IMAGE_DIR, f"{student_id}_{name}")
    os.makedirs(student_dir, exist_ok=True)

    count = 0
    with camera_lock:
        while count < IMAGES_PER_STUDENT:
            ret, frame = cam.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.2, 5)
            for (x, y, w, h) in faces:
                face_img = gray[y:y + h, x:x + w]
                img_path = os.path.join(student_dir, f"{name}_{count}.jpg")
                cv2.imwrite(img_path, face_img)
                count += 1
                break  # One face per frame

            if count % 10 == 0:
                time.sleep(0.1)

    # Release camera after capture
    release_camera()

    return jsonify({
        "student_id": student_id,
        "images_captured": count,
        "message": f"Captured {count} images for {name}",
    })


@app.route("/api/train", methods=["POST"])
def train_model():
    """
    Train the LBPH face recognizer from all captured training images.
    Preserves the original trainImage logic.
    """
    if not os.path.exists(TRAIN_IMAGE_DIR):
        return jsonify({"error": "No training images directory found"}), 400

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    face_cascade = cv2.CascadeClassifier(HAARCASCADE_PATH)

    faces_data = []
    labels = []
    label_map = {}

    students = read_student_details()
    for s in students:
        sid = int(s["ID"])
        label_map[sid] = s["Name"]
        student_dir = os.path.join(TRAIN_IMAGE_DIR, f"{sid}_{s['Name']}")
        if not os.path.isdir(student_dir):
            continue
        for img_file in glob.glob(os.path.join(student_dir, "*.jpg")):
            img = cv2.imread(img_file, cv2.IMREAD_GRAYSCALE)
            if img is not None:
                faces_data.append(np.asarray(img, dtype=np.uint8))
                labels.append(sid)

    if len(faces_data) == 0:
        return jsonify({"error": "No training images found. Register students first."}), 400

    # Ensure unique labels >= 2 for LBPH
    unique_labels = set(labels)
    if len(unique_labels) < 1:
        return jsonify({"error": "Need at least 1 student with training images"}), 400

    recognizer.train(faces_data, np.array(labels))
    recognizer.save(TRAINER_PATH)

    # Save label map
    import json
    with open(os.path.join(TRAIN_LABEL_DIR, "label_map.json"), "w") as f:
        json.dump(label_map, f)

    return jsonify({
        "message": "Model trained successfully",
        "students_trained": len(unique_labels),
    })


@app.route("/api/camera/preview", methods=["GET"])
def camera_preview():
    """Get a single frame from the camera for preview."""
    cam = get_camera()
    if cam is None:
        return jsonify({"frame": "", "available": False}), 200

    with camera_lock:
        ret, frame = cam.read()
    if not ret:
        release_camera()
        return jsonify({"frame": "", "available": False}), 200

    return jsonify({
        "frame": encode_frame(frame),
        "available": True,
    })


@app.route("/api/camera/close", methods=["POST"])
def camera_close():
    """Release the camera resource."""
    release_camera()
    return jsonify({"message": "Camera released"})


@app.route("/api/session/start", methods=["POST"])
def start_session():
    """
    Start an attendance recognition session.
    The engine will continuously run face recognition for the specified duration.
    """
    global active_session
    data = request.get_json() or {}
    subject = data.get("subject", "").strip()
    duration = data.get("duration", 30)

    if not subject:
        return jsonify({"error": "Subject name is required"}), 400
    if not model_exists():
        return jsonify({"error": "Model not trained. Train the model first."}), 400

    session_id = f"sess_{int(time.time())}_{subject.replace(' ', '_')}"

    with session_lock:
        if active_session is not None:
            return jsonify({"error": "A session is already active"}), 409
        active_session = {
            "id": session_id,
            "subject": subject,
            "duration": duration,
            "start_time": time.time(),
            "recognized": {},
            "running": True,
        }

    # Start recognition thread
    thread = threading.Thread(target=_recognition_loop, daemon=True)
    thread.start()

    return jsonify({
        "session_id": session_id,
        "message": f"Attendance session started for {subject}",
    })


def _recognition_loop():
    """Background thread that runs face recognition during a session."""
    global active_session

    cam = get_camera()
    if cam is None:
        with session_lock:
            if active_session:
                active_session["running"] = False
        return

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    try:
        recognizer.read(TRAINER_PATH)
    except Exception:
        return

    face_cascade = cv2.CascadeClassifier(HAARCASCADE_PATH)

    import json
    label_map = {}
    label_map_path = os.path.join(TRAIN_LABEL_DIR, "label_map.json")
    if os.path.exists(label_map_path):
        with open(label_map_path, "r") as f:
            label_map = {int(k): v for k, v in json.load(f).items()}

    end_time = time.time() + active_session["duration"]

    while time.time() < end_time and active_session and active_session["running"]:
        with camera_lock:
            ret, frame = cam.read()
        if not ret:
            time.sleep(0.1)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.2, 5)

        current_detections = []
        for (x, y, w, h) in faces:
            student_id, conf = recognizer.predict(gray[y:y + h, x:x + w])
            if conf < CONFIDENCE_THRESHOLD:
                name = label_map.get(student_id, "Unknown")
                enrollment = ""
                for s in read_student_details():
                    if int(s["ID"]) == student_id:
                        enrollment = s.get("Enrollment", "")
                        break
                current_detections.append({
                    "student_id": student_id,
                    "name": name,
                    "enrollment_no": enrollment,
                    "confidence": round(conf, 1),
                    "recognized": True,
                })
                with session_lock:
                    if active_session:
                        active_session["recognized"][student_id] = {
                            "student_id": student_id,
                            "name": name,
                            "enrollment_no": enrollment,
                            "confidence": round(conf, 1),
                            "recognized": True,
                        }
            else:
                current_detections.append({
                    "student_id": -1,
                    "name": "Unknown",
                    "enrollment_no": "",
                    "confidence": round(conf, 1),
                    "recognized": False,
                })

        with session_lock:
            if active_session:
                active_session["detections"] = current_detections
                active_session["last_frame"] = encode_frame(frame)

        time.sleep(0.5)

    # Session ended
    release_camera()


@app.route("/api/session/<session_id>/frame", methods=["GET"])
def session_frame(session_id):
    """Get the latest frame and detections from an active session."""
    with session_lock:
        if not active_session or active_session["id"] != session_id:
            return jsonify({"error": "Session not found"}), 404
        return jsonify({
            "frame": active_session.get("last_frame", ""),
            "detections": active_session.get("detections", []),
        })


@app.route("/api/session/<session_id>/stop", methods=["POST"])
def stop_session(session_id):
    """Stop an active session and return recognized students."""
    global active_session
    with session_lock:
        if not active_session or active_session["id"] != session_id:
            return jsonify({"error": "Session not found"}), 404
        active_session["running"] = False
        recognized = list(active_session["recognized"].values())
        active_session = None

    release_camera()
    return jsonify({
        "message": "Session stopped",
        "recognized": recognized,
    })


@app.route("/api/students", methods=["GET"])
def list_students():
    """List all registered students from the local CSV."""
    students = read_student_details()
    return jsonify({"students": students})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": ENGINE_VERSION})


if __name__ == "__main__":
    print(f"FaceWise V2 Engine v{ENGINE_VERSION}")
    print(f"  Training images: {TRAIN_IMAGE_DIR}")
    print(f"  Model path:      {TRAINER_PATH}")
    print(f"  Student details: {STUDENT_DETAILS_PATH}")
    print(f"  Starting on http://localhost:5000")
    print()
    app.run(host="0.0.0.0", port=5000, debug=False)
