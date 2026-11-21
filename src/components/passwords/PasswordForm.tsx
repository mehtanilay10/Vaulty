"use client";

import { useState, useEffect } from "react";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import {
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Star,
  ShieldCheck,
  Globe,
  Building2,
  User,
} from "lucide-react";
import {
  encryptEnvelopeWithKey,
  decryptEnvelopeWithKey,
  isEnvelopeEncryption,
} from "@/lib/envelope-crypto";
import { csrfHeaders } from "@/lib/csrf-client";
import { Credential } from "@/types/credentials";

type CredentialType = "APP" | "BANK";

const AVAILABLE_ICONS: { name: string; Component: React.ElementType }[] = [
  { name: "lock", Component: Lock },
  { name: "user", Component: User },
  { name: "globe", Component: Globe },
  { name: "building", Component: Building2 },
  { name: "shield", Component: ShieldCheck },
  { name: "star", Component: Star },
];

interface PasswordFormProps {
  isOpen: boolean;
  onClose: () => void;
  credentialType: CredentialType;
  encryptionKey: CryptoKey;
  onSave: () => void;
  editingCredential?: Credential | null;
  vaultSalt?: string | null;
}

function computePasswordStrength(password: string): {
  strength: number;
  label: string;
  colorClass: string;
} {
  if (!password) return { strength: 0, label: "", colorClass: "bg-surface-muted" };
  const checks = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const passed = checks.filter(Boolean).length;
  if (passed <= 1) return { strength: 1, label: "Very weak", colorClass: "bg-danger" };
  if (passed === 2) return { strength: 2, label: "Weak", colorClass: "bg-danger" };
  if (passed === 3) return { strength: 3, label: "Fair", colorClass: "bg-warning" };
  if (passed === 4) return { strength: 4, label: "Strong", colorClass: "bg-success" };
  return { strength: 4, label: "Very strong", colorClass: "bg-success" };
}

export function PasswordForm({
  isOpen,
  onClose,
  credentialType,
  encryptionKey,
  onSave,
  editingCredential,
  vaultSalt,
}: PasswordFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    username: "",
    password: "",
    netbankPassword: "",
    atmPin: "",
    upiPin: "",
    mobileAppPin: "",
    mobileTransactionPin: "",
    icon: "",
    iconColor: "",
  });

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing data if editing
  useEffect(() => {
    if (editingCredential) {
      const decryptFields = async () => {
        try {
          const decrypted: Record<string, string | boolean | null> = {};
          for (const [key, value] of Object.entries(editingCredential)) {
            if (
              value &&
              typeof value === "string" &&
              key !== "id" &&
              key !== "vaultId" &&
              key !== "createdAt" &&
              key !== "updatedAt" &&
              key !== "isFavorite"
            ) {
              if (key === "icon" || key === "iconColor") {
                decrypted[key] = value;
              } else {
                try {
                  if (isEnvelopeEncryption(value)) {
                    const parsed = JSON.parse(value);
                    decrypted[key] = await decryptEnvelopeWithKey(parsed, encryptionKey);
                  }
                } catch {
                  decrypted[key] = "";
                }
              }
            }
          }
          setFormData((prev) => ({ ...prev, ...decrypted }));
        } catch (err) {
          console.error("Error decrypting credential:", err);
        }
      };
      decryptFields();
    }
  }, [editingCredential, encryptionKey]);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied({ ...copied, [field]: true });
    setTimeout(() => setCopied({ ...copied, [field]: false }), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    // For bank credentials, require at least one password field
    if (credentialType === "BANK") {
      const hasPassword =
        formData.netbankPassword ||
        formData.atmPin ||
        formData.upiPin ||
        formData.mobileAppPin ||
        formData.mobileTransactionPin;

      if (!hasPassword) {
        setError("At least one password field is required for bank credentials");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      // Encrypt sensitive fields with versioned envelope encryption (KEK + DEK + AES-256-GCM);
      // icon/iconColor are stored as plaintext UI hints
      const encryptedData: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (key === "icon" || key === "iconColor") {
          if (value) {
            encryptedData[key] = value;
          } else if (editingCredential) {
            encryptedData[key] = null;
          }
        } else if (value) {
          const envelope = await encryptEnvelopeWithKey(
            value,
            encryptionKey,
            vaultSalt || undefined,
          );
          encryptedData[key] = JSON.stringify(envelope);
        } else if (editingCredential) {
          // When editing, send null for cleared fields so backend removes the old stored value
          encryptedData[key] = null;
        }
      }

      const endpoint = credentialType === "APP" ? "/api/passwords/app" : "/api/passwords/bank";
      const method = editingCredential ? "PUT" : "POST";
      const url = editingCredential ? `${endpoint}/${editingCredential.id}` : endpoint;

      const response = await fetch(url, {
        method,
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(encryptedData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save credential");
      }

      onSave();
      onClose();
      setFormData({
        name: "",
        url: "",
        username: "",
        password: "",
        netbankPassword: "",
        atmPin: "",
        upiPin: "",
        mobileAppPin: "",
        mobileTransactionPin: "",
        icon: "",
        iconColor: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credential");
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] });
  };

  const selectIcon = (name: string, color?: string) => {
    setFormData((prev) => ({ ...prev, icon: name, iconColor: color || prev.iconColor }));
  };

  const renderPasswordField = (label: string, field: keyof typeof formData, required = false) => {
    const isSecretField = field === "password" || field === "netbankPassword";
    const strengthInfo = isSecretField ? computePasswordStrength(formData[field]) : null;

    return (
      <div className="space-y-2">
        <Label htmlFor={field}>
          {label} {required && <span className="text-danger">*</span>}
        </Label>
        <div className="relative">
          <Input
            id={field}
            type={showPasswords[field] ? "text" : field === "username" ? "text" : "password"}
            value={formData[field]}
            onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
            placeholder={`Enter ${label.toLowerCase()}`}
            className="pr-20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {field !== "username" && (
              <button
                type="button"
                onClick={() => togglePasswordVisibility(field)}
                className="p-1 text-text-muted hover:text-text-primary"
                title={showPasswords[field] ? "Hide password" : "Show password"}
              >
                {showPasswords[field] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}
            {formData[field] && (
              <button
                type="button"
                onClick={() => handleCopy(formData[field], field)}
                className="p-1 text-text-muted hover:text-text-primary"
                title="Copy to clipboard"
              >
                {copied[field] ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
        {strengthInfo && formData[field] && (
          <div className="mt-1 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Password strength</span>
              <span className="font-medium text-text-secondary">{strengthInfo.label}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1.5 rounded-full transition-colors ${
                    step <= strengthInfo.strength ? strengthInfo.colorClass : "bg-surface-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={
        editingCredential
          ? `Edit ${credentialType === "APP" ? "App" : "Bank"} Credential`
          : `Add ${credentialType === "APP" ? "App" : "Bank"} Credential`
      }
      description={
        editingCredential ? "Update your credential details" : "Add a new credential to your vault"
      }
      icon={<Lock className="h-5 w-5" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : editingCredential ? "Update" : "Save"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="danger">
            <p className="text-xs">{error}</p>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-danger">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={credentialType === "APP" ? "e.g., Netflix" : "e.g., HDFC Bank"}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="icon">Icon</Label>
          <div className="grid grid-cols-5 gap-2">
            {AVAILABLE_ICONS.map(({ name: iconName, Component: Icon }) => (
              <button
                key={iconName}
                type="button"
                onClick={() => selectIcon(iconName)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-md border transition-colors",
                  formData.icon === iconName
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border-subtle text-text-muted hover:border-text-muted hover:bg-surface-muted",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="iconColor">Icon color</Label>
            <div className="flex items-center gap-2.5">
              <input
                id="iconColor"
                type="color"
                value={formData.iconColor || "#2563eb"}
                onChange={(e) => setFormData({ ...formData, iconColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border border-border-subtle bg-surface p-1"
              />
              <span className="font-mono text-xs text-text-muted">
                {formData.iconColor || "#2563eb"}
              </span>
            </div>
          </div>
        </div>

        {credentialType === "APP" && (
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="e.g., https://netflix.com"
            />
          </div>
        )}

        {renderPasswordField("Username", "username", true)}

        {credentialType === "APP" ? (
          renderPasswordField("Password", "password", true)
        ) : (
          <>
            {renderPasswordField("Netbank Password", "netbankPassword")}
            {renderPasswordField("ATM PIN", "atmPin")}
            {renderPasswordField("UPI PIN", "upiPin")}
            {renderPasswordField("Mobile App PIN", "mobileAppPin")}
            {renderPasswordField("Mobile Transaction PIN", "mobileTransactionPin")}
          </>
        )}
      </form>
    </Blade>
  );
}

function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
