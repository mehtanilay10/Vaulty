"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Eye, EyeOff, Check, Copy, HelpCircle, ShieldCheck } from "lucide-react";
import { generateRecoveryKey, getRecoveryQuestions, hashRecoveryAnswer } from "@/lib/key-recovery";
import { csrfHeaders } from "@/lib/csrf-client";

interface RecoverySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  encryptionKey: CryptoKey;
  onComplete: () => void;
}

interface StoredRecovery {
  keyId: string;
  recoveryKey: string;
  encryptedKEK: string;
  salt: string;
  iv: string;
  kdfIterations: number;
}

export function RecoverySetupModal({
  isOpen,
  onClose,
  encryptionKey,
  onComplete,
}: RecoverySetupModalProps) {
  const [step, setStep] = useState<"generate" | "questions" | "done">("generate");
  const [stored, setStored] = useState<StoredRecovery | null>(null);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [questions, setQuestions] = useState<{ id: string; question: string; answer: string }[]>(
    [],
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const availableQuestions = getRecoveryQuestions();
  const displayError = !encryptionKey
    ? "Vault is not unlocked. Unlock your vault before setting up recovery."
    : error;

  const handleClose = () => {
    setStep("generate");
    setStored(null);
    setError("");
    setAcknowledged(false);
    setCopied(false);
    setQuestions([]);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !encryptionKey || stored) return;

    let active = true;
    (async () => {
      try {
        const result = await generateRecoveryKey(encryptionKey);
        if (active) setStored(result);
      } catch (err) {
        if (active) setError("Failed to generate recovery key.");
        console.error(err);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, encryptionKey, stored]);

  const handleCopy = async () => {
    if (!stored) return;
    try {
      await navigator.clipboard.writeText(stored.recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleNextQuestions = () => {
    if (!acknowledged) {
      setError("Please acknowledge that you have safely stored your recovery key.");
      return;
    }
    setError("");
    if (questions.length === 0) {
      const defaultQuestions = availableQuestions.slice(0, 3);
      setQuestions(defaultQuestions.map((q) => ({ id: q, question: q, answer: "" })));
    }
    setStep("questions");
  };

  const handleQuestionSelect = (index: number, newQuestion: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], id: newQuestion, question: newQuestion };
      return updated;
    });
  };

  const handleAnswerChange = (index: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], answer: value };
      return updated;
    });
  };

  const handleSaveRecovery = async () => {
    setError("");

    // Validate questions are unique and answers non-empty
    const uniqueQuestions = new Set(questions.map((q) => q.question));
    if (uniqueQuestions.size < 3) {
      setError("Please choose three distinct security questions.");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].answer.trim()) {
        setError(`Please provide an answer for question ${i + 1}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (!stored) throw new Error("Recovery key not generated.");

      const questionsPayload = await Promise.all(
        questions.map(async (q) => ({
          id: q.id,
          question: q.question,
          answerHash: await hashRecoveryAnswer(q.answer.trim()),
        })),
      );

      const response = await fetch("/api/passwords/recovery/setup", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          recoveryKeyId: stored.keyId,
          recoveryKeyHash: await hashRecoveryAnswer(stored.recoveryKey),
          recoveryEncryptedKEK: stored.encryptedKEK,
          recoverySalt: stored.salt,
          recoveryIv: stored.iv,
          recoveryKdfIterations: stored.kdfIterations,
          recoveryQuestions: questionsPayload,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save recovery setup.");
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recovery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "generate") {
    return (
      <Modal open={isOpen} onClose={handleClose} title="Set Up Offline Recovery Key">
        <div className="space-y-4">
          <Alert variant="info">
            <p className="text-xs leading-relaxed">
              Vaulty protects credentials with end-to-end zero-knowledge encryption. If you ever
              forget your master password, your <strong>offline recovery key</strong> and{" "}
              <strong>security answers</strong> allow you to recover and re-encrypt your vault
              without losing any saved credentials.
            </p>
          </Alert>

          {stored && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="recoveryKey" className="text-xs font-semibold">
                  Your 64-Character Recovery Key
                </Label>
                <span className="text-[11px] text-text-muted">Keep offline & confidential</span>
              </div>
              <div className="relative">
                <Input
                  id="recoveryKey"
                  readOnly
                  type={showRecoveryKey ? "text" : "password"}
                  value={stored.recoveryKey}
                  className="h-10 pr-20 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryKey(!showRecoveryKey)}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1"
                  title={showRecoveryKey ? "Hide key" : "Show key"}
                >
                  {showRecoveryKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                {copied ? (
                  <span className="text-success font-medium">Copied to clipboard!</span>
                ) : (
                  "Copy or write this key down. Store it offline (e.g. printed or in a safe place)."
                )}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border-subtle bg-surface-muted p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-border-subtle bg-surface text-brand focus:ring-brand"
              />
              <span className="text-xs text-text-secondary">
                I have copied and saved my recovery key in a safe, offline location. I understand it
                cannot be retrieved if lost.
              </span>
            </label>
          </div>

          {displayError && (
            <Alert variant="danger">
              <p className="text-xs">{displayError}</p>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleNextQuestions} disabled={!acknowledged || !stored}>
              Next: Security Questions
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === "questions") {
    return (
      <Modal open={isOpen} onClose={handleClose} title="Configure Security Questions">
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Select three security questions and provide answers. Your answers are hashed client-side
            and used alongside your offline recovery key to authorize vault recovery.
          </p>

          <div className="space-y-3.5">
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="space-y-1.5 rounded-lg border border-border-subtle p-3 bg-surface-muted/50"
              >
                <Label
                  htmlFor={`question-select-${idx}`}
                  className="text-xs font-semibold text-text-primary flex items-center gap-1.5"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-brand" />
                  Question {idx + 1}
                </Label>
                <select
                  id={`question-select-${idx}`}
                  value={q.question}
                  onChange={(e) => handleQuestionSelect(idx, e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-primary focus:border-brand focus:outline-none"
                >
                  {availableQuestions.map((availQ) => (
                    <option key={availQ} value={availQ}>
                      {availQ}
                    </option>
                  ))}
                </select>

                <div className="pt-1">
                  <Input
                    id={`recovery-answer-${idx}`}
                    type="text"
                    value={q.answer}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    placeholder="Your answer"
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            ))}
          </div>

          {displayError && (
            <Alert variant="danger">
              <p className="text-xs">{displayError}</p>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("generate")}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button type="button" onClick={handleSaveRecovery} disabled={isSubmitting}>
              {isSubmitting ? "Saving Recovery Setup..." : "Save Recovery Setup"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // Done
  return (
    <Modal open={isOpen} onClose={handleClose} title="Recovery Setup Complete">
      <div className="py-2 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Vault Recovery Configured</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Your offline recovery key and security questions have been saved. Your saved
              credentials are protected against accidental lock-out.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={() => {
              onComplete();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
