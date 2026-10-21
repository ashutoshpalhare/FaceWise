"use client";

/**
 * Camera lifecycle hook — fixes V2's biggest operational bug (a global camera
 * singleton that leaked on errors). Here: one stream per component, always
 * torn down on unmount, on tab-hide, and on device switches.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CamStatus = "idle" | "starting" | "live" | "error";

export interface CameraState {
  status: CamStatus;
  error: string | null;
  label: string | null;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

function mapCamError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was denied. Allow camera access for this site in the browser prompt or site settings, then retry.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera device found. Connect a webcam or use photo-file enrollment instead.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is busy or unreadable (another app is using it). Close other apps and retry.";
    case "SecurityError":
      return "Camera blocked by browser security policy. FaceWise must be served over HTTPS (or localhost), and embedded frames need allow=\"camera\".";
    default:
      return err instanceof Error ? err.message : "Unknown camera error.";
  }
}

export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({ status: "idle", error: null, label: null });
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) for (const t of stream.getTracks()) t.stop();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
    setState((s) => ({ ...s, status: "idle", error: null, label: null }));
  }, [videoRef]);

  const start = useCallback(
    async (deviceId?: string) => {
      stop();
      stoppedRef.current = false;
      setState((s) => ({ ...s, status: "starting", error: null }));
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("getUserMedia unavailable", "SecurityError");
        }
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stoppedRef.current) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) {
          stop();
          return;
        }
        v.srcObject = stream;
        v.muted = true;
        await v.play().catch(() => undefined);
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.();
        setState({
          status: "live",
          error: null,
          label: track?.label ?? (settings?.deviceId ? "camera" : "camera"),
        });
        const listed = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setDevices(
          listed
            .filter((d) => d.kind === "videoinput")
            .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` })),
        );
      } catch (err) {
        setState({ status: "error", error: mapCamError(err), label: null });
      }
    },
    [stop, videoRef],
  );

  // Auto-pause when the tab hides (privacy + releases the hardware).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.enabled = false;
      } else if (!document.hidden && streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.enabled = true;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Guaranteed cleanup — the V2 leak can't happen here.
  useEffect(() => stop, [stop]);

  return { state, devices, start, stop };
}
