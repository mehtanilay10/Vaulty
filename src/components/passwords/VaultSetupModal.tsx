"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Eye, EyeOff } from "lucide-react";
import { generateSalt, validateMasterPassword } from "@/lib/crypto";
import { csrfHeaders } from "@/lib/csrf-client";

interface VaultSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: (masterPassword: string, salt: string, vaultId: string) => void;
}

export function VaultSetupModal({ isOpen, onClose, onSetupComplete }: VaultSetupModalProps) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Validate password strength
    const validation = validateMasterPassword(masterPassword);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Check passwords match
    if (masterPassword !== confirmPassword) {
      setErrors(["Passwords do not match"]);
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate salt for encryption
      const salt = await generateSalt();

      // Send plain password to API (server will hash with bcrypt)
      const response = await fetch("/api/passwords/setup", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          masterPassword,
          encryptionSalt: salt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to setup vault");
      }

      const data = await response.json();

      // Pass master password and salt to parent (for key derivation)
      onSetupComplete(masterPassword, salt, data.vaultId);

      // Reset form and close modal
      setMasterPassword("");
      setConfirmPassword("");
      onClose();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Failed to setup vault"]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Setup Password Vault">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="masterPassword">Master Password</Label>
          <div className="relative">
            <Input
              id="masterPassword"
              type={showPassword ? "text" : "password"}
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Create a strong master password"
              className="pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-text-muted">
            This password will encrypt all your credentials. Minimum 8 characters required. Once
            created, you can configure an offline recovery key and security questions to protect
            against lockout.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Master Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your master password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <Alert variant="danger">
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, i) => (
                <li key={i} className="text-xs">
                  {error}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Setting up..." : "Create Vault"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
