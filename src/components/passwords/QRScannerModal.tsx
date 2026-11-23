"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { Camera, Upload, KeyRound, AlertCircle, RefreshCw, CheckCircle2, Scan } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { parseOtpAuthUri, generateTOTP, getTOTPRemainingSeconds } from "@/lib/totp";

export interface Scanned2FAAccount {
  issuer: string;
  account: string;
  secret: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanned: (account: Scanned2FAAccount) => void;
}

export function QRScannerModal({ isOpen, onClose, onScanned }: QRScannerModalProps) {
  const [mode, setMode] = useState<"camera" | "upload" | "manual">("camera");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isScanning, setIsScanning] = useState(false);

  // Manual entry state
  const [manualIssuer, setManualIssuer] = useState("");
  const [manualAccount, setManualAccount] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  // Preview countdown
  const [remainingSec, setRemainingSec] = useState(30);

  // Scanned result for confirmation
  const [detectedAccount, setDetectedAccount] = useState<Scanned2FAAccount | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Stop camera stream cleanly
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Parse decoded QR text
  const processDecodedString = useCallback(
    async (text: string) => {
      const parsed = parseOtpAuthUri(text);
      if (parsed && parsed.secret) {
        const result: Scanned2FAAccount = {
          issuer: parsed.issuer || "Authenticator",
          account: parsed.account || "Account",
          secret: parsed.secret,
          algorithm: parsed.algorithm || "SHA1",
          digits: parsed.digits || 6,
          period: parsed.period || 30,
        };
        stopCamera();
        setDetectedAccount(result);
        return true;
      }

      // Check if it's a bare Base32 key
      const cleaned = text
        .trim()
        .toUpperCase()
        .replace(/[\s\-_=]/g, "");
      if (/^[A-Z2-7]{16,64}$/.test(cleaned)) {
        const result: Scanned2FAAccount = {
          issuer: "2-Step Account",
          account: "Account",
          secret: cleaned,
          digits: 6,
          period: 30,
        };
        stopCamera();
        setDetectedAccount(result);
        return true;
      }

      return false;
    },
    [stopCamera],
  );

  // Start camera and scanner loop
  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setIsScanning(true);
      }
    } catch (err) {
      console.warn("[QR Scanner] Camera error:", err);
      setCameraError(
        "Unable to access camera. Please allow camera permissions or upload an image of the QR code.",
      );
      setMode("upload");
    }
  }, [facingMode, stopCamera]);

  // Frame scanning loop with jsQR
  useEffect(() => {
    if (!isScanning || mode !== "camera") return;

    let active = true;

    const scanFrame = () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            processDecodedString(code.data).then((success) => {
              if (!success) {
                // Resume loop if not a valid TOTP QR
                if (active) {
                  animationFrameRef.current = requestAnimationFrame(scanFrame);
                }
              }
            });
            return;
          }
        }
      }

      if (active) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isScanning, mode, processDecodedString]);

  // Lifecycle when modal opens/closes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setDetectedAccount(null);
      setManualError(null);
      if (mode === "camera") {
        startCamera();
      }
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, mode, startCamera, stopCamera]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle uploaded image file for QR
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          const success = await processDecodedString(code.data);
          if (!success) {
            alert("QR code scanned, but it is not a valid 2-step authenticator code.");
          }
        } else {
          alert(
            "Could not detect a QR code in this image. Please try another image or enter the key manually.",
          );
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Live TOTP generator for manual entry preview
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!manualSecret.trim()) {
      setPreviewCode(null);
      return;
    }

    const updatePreview = async () => {
      try {
        const code = await generateTOTP(manualSecret.trim());
        setPreviewCode(code);
        setManualError(null);
      } catch {
        setPreviewCode(null);
        setManualError("Invalid Base32 secret key format.");
      }
    };

    updatePreview();
    const interval = setInterval(() => {
      setRemainingSec(getTOTPRemainingSeconds());
      updatePreview();
    }, 1000);

    return () => clearInterval(interval);
  }, [manualSecret]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Confirm and submit scanned account
  const handleConfirmAccount = () => {
    if (detectedAccount) {
      onScanned(detectedAccount);
      onClose();
    }
  };

  // Submit manual account
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSecret.trim()) {
      setManualError("Secret key is required.");
      return;
    }

    try {
      const account: Scanned2FAAccount = {
        issuer: manualIssuer.trim() || "Authenticator",
        account: manualAccount.trim() || "Account",
        secret: manualSecret.trim(),
        digits: 6,
        period: 30,
      };
      onScanned(account);
      onClose();
    } catch {
      setManualError("Failed to configure authenticator account.");
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="Set Up 2-Step Authenticator"
      description="Scan the QR code displayed on Microsoft, Google, GitHub, or any website's 2FA setup screen."
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* If an account has been detected, show the confirmation screen */}
        {detectedAccount ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">QR Code Detected!</h3>
              <p className="text-xs text-text-muted mt-1">
                Confirm your 2-step authenticator account details below.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-3 text-left space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Service / Issuer:</span>
                <span className="font-semibold text-text-primary">{detectedAccount.issuer}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Account:</span>
                <span className="font-mono text-text-secondary">{detectedAccount.account}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Code type:</span>
                <span className="text-brand font-medium">Time-based (30s TOTP)</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDetectedAccount(null);
                  if (mode === "camera") startCamera();
                }}
              >
                Scan Again
              </Button>
              <Button onClick={handleConfirmAccount}>Save to Authenticator</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode switch tabs */}
            <div className="flex rounded-lg border border-border-subtle bg-surface-muted/50 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("camera");
                  startCamera();
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  mode === "camera"
                    ? "bg-surface text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                Scan with Camera
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode("upload");
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  mode === "upload"
                    ? "bg-surface text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload QR Image
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode("manual");
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  mode === "manual"
                    ? "bg-surface text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Enter Key
              </button>
            </div>

            {/* Mode 1: Live Camera Scanner */}
            {mode === "camera" && (
              <div className="space-y-3">
                <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-xl border border-border-subtle bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover" muted />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Microsoft Authenticator-style targeting reticle */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                    <div className="relative h-48 w-48 rounded-xl border-2 border-brand/60 shadow-lg">
                      {/* Corner marks */}
                      <span className="absolute -top-1 -left-1 h-4 w-4 border-t-3 border-l-3 border-brand" />
                      <span className="absolute -top-1 -right-1 h-4 w-4 border-t-3 border-r-3 border-brand" />
                      <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-3 border-l-3 border-brand" />
                      <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-3 border-r-3 border-brand" />
                      {/* Scanning laser animation */}
                      <div className="h-0.5 w-full bg-brand shadow-[0_0_8px_rgba(37,99,235,0.8)] animate-pulse" />
                    </div>
                  </div>

                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/90 p-4 text-center">
                      <AlertCircle className="h-8 w-8 text-danger mb-2" />
                      <p className="text-xs text-text-secondary">{cameraError}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted px-2">
                  <span>Align the QR code within the frame</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
                      startCamera();
                    }}
                    className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Switch Camera
                  </button>
                </div>
              </div>
            )}

            {/* Mode 2: Upload QR Image */}
            {mode === "upload" && (
              <div className="space-y-4 py-4">
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle hover:border-brand/50 bg-surface-muted/30 p-8 cursor-pointer transition-colors text-center">
                  <Scan className="h-10 w-10 text-brand mb-2" />
                  <span className="text-sm font-semibold text-text-primary">
                    Upload a QR code screenshot
                  </span>
                  <span className="text-xs text-text-muted mt-1">
                    Drag and drop or click to select PNG, JPG, or WEBP
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Mode 3: Manual Secret Key Entry */}
            {mode === "manual" && (
              <form onSubmit={handleManualSubmit} className="space-y-3 py-1">
                <div>
                  <Label htmlFor="issuer">Service / Issuer (e.g., Google, Microsoft)</Label>
                  <Input
                    id="issuer"
                    placeholder="e.g. GitHub"
                    value={manualIssuer}
                    onChange={(e) => setManualIssuer(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="account">Account Name or Email</Label>
                  <Input
                    id="account"
                    placeholder="e.g. alex@example.com"
                    value={manualAccount}
                    onChange={(e) => setManualAccount(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="secret">Secret Key (Base32)</Label>
                  <Input
                    id="secret"
                    placeholder="e.g. JBSWY3DPEHPK3PXP"
                    className="font-mono"
                    value={manualSecret}
                    onChange={(e) => setManualSecret(e.target.value)}
                    required
                  />
                  {manualError && <p className="text-xs text-danger mt-1">{manualError}</p>}
                </div>

                {previewCode && (
                  <div className="rounded-lg border border-brand/20 bg-brand/5 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-text-muted">Live 2FA Code Preview</p>
                      <p className="text-xl font-mono font-bold text-brand tracking-wider">
                        {previewCode.slice(0, 3)} {previewCode.slice(3)}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-text-muted">
                      {remainingSec}s
                    </span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" type="button" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!manualSecret.trim() || !!manualError}>
                    Save Account
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
