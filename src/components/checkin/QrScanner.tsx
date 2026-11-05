"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";

/**
 * In-page QR scanner that works in iPhone Safari and Android Chrome (no app).
 * Uses the rear camera via getUserMedia and decodes frames with jsQR.
 * Calls onToken once with the pass token from a /check-in/scan/<token> URL
 * on this site; any other QR code is ignored with a message.
 */
export function QrScanner({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Point the camera at the guest's QR code.");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    let lastWrong = 0;

    const tokenFrom = (text: string): string | null => {
      try {
        const u = new URL(text);
        const m = u.pathname.match(/^\/check-in\/scan\/([A-Za-z0-9_-]{20,100})$/);
        return u.origin === location.origin && m ? m[1] : null;
      } catch {
        return null;
      }
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (done || !video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Downscale for speed on older phones.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const token = tokenFrom(code.data);
            if (token) {
              done = true;
              navigator.vibrate?.(80);
              onToken(token);
              return;
            }
            if (Date.now() - lastWrong > 2000) {
              lastWrong = Date.now();
              setHint("That QR code is not an event pass. Try the guest's invitation pass.");
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot open the camera. Use Enter reference instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true"); // required on iPhone
        await video.play();
        raf = requestAnimationFrame(tick);
      } catch (err) {
        const name = (err as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow camera access for this site in your browser settings, or use Enter reference."
            : "The camera could not be started. Use Enter reference instead."
        );
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onToken]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Scan QR code">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-[16px] font-medium">Scan pass</p>
        <button type="button" onClick={onClose} aria-label="Close scanner" className="w-12 h-12 grid place-items-center rounded-[12px] bg-white/10">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="relative flex-1 grid place-items-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <div aria-hidden="true" className="relative w-[70vw] max-w-[320px] aspect-square rounded-[24px] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      <p role="status" className="p-5 text-center text-[15px] text-white">{error ?? hint}</p>
    </div>
  );
}
