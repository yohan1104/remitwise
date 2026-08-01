"use client";

import * as React from "react";
import { PaymentError, type PaymentErrorCode } from "@/lib/payments/errors";
import { detectCodes, preloadDecoder } from "./decode";

/**
 * ---------------------------------------------------------------------------
 *  Live camera QR scanning.
 * ---------------------------------------------------------------------------
 *  Owns the whole camera lifecycle: permission, stream, torch, switching
 *  between lenses, sampling frames, and — importantly — stopping the moment a
 *  code is found so the sensor light never stays on longer than needed.
 *
 *  Frames are sampled at ~12 fps into a small offscreen canvas (the longest
 *  side is capped at 720 px). That is far cheaper than decoding every frame at
 *  full resolution and, in practice, faster to first detection because each
 *  attempt completes well inside a frame budget.
 * ---------------------------------------------------------------------------
 */

export type ScannerState = "idle" | "starting" | "scanning" | "error";

/** Longest side of the frame we hand the decoder. */
const SAMPLE_SIZE = 720;
/** Minimum gap between decode attempts. */
const SAMPLE_INTERVAL_MS = 80;

export interface UseQrScannerOptions {
  /** Drives the camera: false releases it immediately. */
  active: boolean;
  /** Called once per successful decode; the scanner stops before it fires. */
  onDetected: (value: string) => void;
}

export interface QrScannerApi {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: ScannerState;
  errorCode: PaymentErrorCode | null;
  /** True once frames are actually flowing (used to fade the preview in). */
  streaming: boolean;
  torch: { supported: boolean; on: boolean; toggle: () => void };
  /** More than one camera → offer a flip control. */
  canSwitchCamera: boolean;
  switchCamera: () => void;
  retry: () => void;
}

/** `torch` is a well-supported extension that isn't in the DOM lib types. */
function supportsTorch(track: MediaStreamTrack | undefined): boolean {
  const getCapabilities = (
    track as (MediaStreamTrack & { getCapabilities?: () => { torch?: boolean } }) | undefined
  )?.getCapabilities;
  if (typeof getCapabilities !== "function" || !track) return false;
  try {
    return Boolean(getCapabilities.call(track).torch);
  } catch {
    return false;
  }
}

export function useQrScanner({ active, onDetected }: UseQrScannerOptions): QrScannerApi {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const busyRef = React.useRef(false);
  const doneRef = React.useRef(false);
  const lastSampleRef = React.useRef(0);
  // Latest callback without re-running the camera effect on every render.
  const onDetectedRef = React.useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [state, setState] = React.useState<ScannerState>("idle");
  const [errorCode, setErrorCode] = React.useState<PaymentErrorCode | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  const [deviceIds, setDeviceIds] = React.useState<string[]>([]);
  const [deviceIndex, setDeviceIndex] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);

  const stop = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setStreaming(false);
    setTorchOn(false);
  }, []);

  React.useEffect(() => {
    if (!active) {
      doneRef.current = false;
      stop();
      setState("idle");
      setErrorCode(null);
      return;
    }

    let cancelled = false;
    doneRef.current = false;
    busyRef.current = false;
    setState("starting");
    setErrorCode(null);
    preloadDecoder();

    const fail = (code: PaymentErrorCode) => {
      if (cancelled) return;
      stop();
      setErrorCode(code);
      setState("error");
    };

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        // No mediaDevices at all almost always means a non-secure origin.
        fail(
          typeof window !== "undefined" && !window.isSecureContext
            ? "camera_insecure_context"
            : "camera_unavailable",
        );
        return;
      }
      if (!window.isSecureContext) {
        fail("camera_insecure_context");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceIds[deviceIndex]
            ? { deviceId: { exact: deviceIds[deviceIndex] } }
            : {
                // Rear camera on phones; harmless on laptops.
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        });
      } catch (err) {
        fail(cameraErrorCode(err));
        return;
      }

      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Autoplay can be refused until the element is on screen; the frame
        // loop below tolerates a not-yet-playing video.
      }
      if (cancelled) return;

      setTorchSupported(supportsTorch(stream.getVideoTracks()[0]));

      // Device labels/ids are only exposed after permission is granted.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDeviceIds(
            devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => d.deviceId),
          );
        }
      } catch {
        /* switching simply stays unavailable */
      }

      setStreaming(true);
      setState("scanning");

      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        fail("camera_unavailable");
        return;
      }

      const tick = async (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (cancelled || doneRef.current || busyRef.current) return;
        if (now - lastSampleRef.current < SAMPLE_INTERVAL_MS) return;
        if (document.visibilityState === "hidden") return;

        const el = videoRef.current;
        if (!el || el.readyState < 2 || el.videoWidth === 0) return;

        lastSampleRef.current = now;
        busyRef.current = true;
        try {
          const scale = Math.min(1, SAMPLE_SIZE / Math.max(el.videoWidth, el.videoHeight));
          const w = Math.max(1, Math.round(el.videoWidth * scale));
          const h = Math.max(1, Math.round(el.videoHeight * scale));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          ctx.drawImage(el, 0, 0, w, h);
          const codes = await detectCodes(ctx.getImageData(0, 0, w, h));
          if (codes.length > 0 && !doneRef.current && !cancelled) {
            // Stop first: the camera must be off before the UI transitions.
            doneRef.current = true;
            stop();
            onDetectedRef.current(codes[0].value);
          }
        } catch {
          // A dropped frame is not an error — keep scanning.
        } finally {
          busyRef.current = false;
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, attempt, deviceIndex, deviceIds, stop]);

  // Release the camera when the tab is backgrounded, and pick it up again on
  // return — browsers freeze the stream anyway, and users notice a live light.
  React.useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !doneRef.current && !streamRef.current) {
        setAttempt((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  const toggleTorch = React.useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !supportsTorch(track)) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  }, [torchOn]);

  const switchCamera = React.useCallback(() => {
    if (deviceIds.length < 2) return;
    stop();
    setDeviceIndex((i) => (i + 1) % deviceIds.length);
  }, [deviceIds.length, stop]);

  const retry = React.useCallback(() => {
    doneRef.current = false;
    setErrorCode(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    videoRef,
    state,
    errorCode,
    streaming,
    torch: { supported: torchSupported, on: torchOn, toggle: toggleTorch },
    canSwitchCamera: deviceIds.length > 1,
    switchCamera,
    retry,
  };
}

function cameraErrorCode(err: unknown): PaymentErrorCode {
  if (err instanceof PaymentError) return err.code;
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "camera_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "camera_unavailable";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "camera_unavailable";
    default:
      return "camera_unavailable";
  }
}
