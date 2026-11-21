"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { csrfHeaders } from "@/lib/csrf-client";
import { Plus, Trash2, ShieldCheck } from "lucide-react";

const fields = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["mobile", "Mobile number"],
  ["dateOfBirth", "Date of birth (DDMMYYYY or institution format)"],
  ["pan", "PAN number"],
] as const;
type Template = { id: string; institution: string; pattern: string; enabled: boolean };

export function PdfPasswordSettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [masked, setMasked] = useState<Record<string, string | null>>({});
  const [customName, setCustomName] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [clearFields, setClearFields] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/pdf-passwords", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load PDF password settings.");
        if (active) {
          setMasked(data.values || {});
          setTemplates(data.templates || []);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const addTemplate = () =>
    setTemplates((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        institution: "",
        pattern: "{{firstName}}{{dateOfBirth}}",
        enabled: true,
      },
    ]);
  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/pdf-passwords", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          values,
          customValues,
          clearFields,
          templates,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save PDF password settings.");
      setMasked(data.values || {});
      setValues({});
      setCustomValues({});
      setClearFields([]);
      setCustomName("");
      setCustomValue("");
      setTemplates(data.templates || []);
      setMessage("PDF password settings saved securely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs text-text-muted">Loading encrypted settings…</p>;
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border-subtle bg-surface-muted p-3 text-xs text-text-secondary">
        <div className="flex items-center gap-2 font-semibold text-text-primary">
          <ShieldCheck className="h-4 w-4 text-success" /> Encrypted personal values
        </div>
        <p className="mt-1">
          Values are encrypted before being stored. They are masked after saving and are used only
          on the server to try local PDF decryption. They are never sent to the AI provider or
          written to logs.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`pdf-${key}`}>{label}</Label>
              {masked[key] && (
                <button
                  type="button"
                  className="text-[11px] text-danger"
                  onClick={() => setClearFields((items) => [...new Set([...items, key])])}
                >
                  Clear saved value
                </button>
              )}
            </div>
            <Input
              id={`pdf-${key}`}
              type="password"
              autoComplete="off"
              value={values[key] || ""}
              onChange={(event) => {
                setClearFields((items) => items.filter((item) => item !== key));
                setValues((current) => ({ ...current, [key]: event.target.value }));
              }}
              placeholder={masked[key] ? `Saved: ${masked[key]}` : "Not configured"}
            />
            {clearFields.includes(key) && (
              <p className="text-[10px] text-warning">Will be cleared when you save.</p>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Custom personal values</h4>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder="Token name e.g. customerId"
          />
          <Input
            type="password"
            autoComplete="off"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="Value"
          />
          <Button
            variant="secondary"
            disabled={!customName.trim() || !customValue}
            onClick={() => {
              setClearFields((items) => items.filter((item) => item !== `custom:${customName}`));
              setCustomValues((current) => ({ ...current, [customName]: customValue }));
              setCustomName("");
              setCustomValue("");
            }}
          >
            Add value
          </Button>
        </div>
        {Object.entries(masked)
          .filter(([key]) => key.startsWith("custom:"))
          .map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-xs text-text-muted">
              <span className="flex-1">
                {key.slice(7)}: {value}
              </span>
              <button
                type="button"
                className="text-danger"
                onClick={() => setClearFields((items) => [...new Set([...items, key])])}
              >
                Clear
              </button>
              {clearFields.includes(key) && (
                <span className="text-warning">Will clear on save</span>
              )}
            </div>
          ))}
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              Institution password templates
            </h4>
            <p className="text-xs text-text-muted">
              Use tokens such as {"{{firstName}}"}, {"{{dateOfBirth}}"}, {"{{pan}}"} or your custom
              token.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={addTemplate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add template
          </Button>
        </div>
        {templates.map((template, index) => (
          <div key={template.id} className="grid gap-2 rounded-lg border border-border-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-secondary">
                Template {index + 1}
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  setTemplates((items) => items.filter((item) => item.id !== template.id))
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
            <Input
              value={template.institution}
              onChange={(event) =>
                setTemplates((items) =>
                  items.map((item) =>
                    item.id === template.id ? { ...item, institution: event.target.value } : item,
                  ),
                )
              }
              placeholder="Bank or institution name (or DEFAULT)"
            />
            <Input
              value={template.pattern}
              onChange={(event) =>
                setTemplates((items) =>
                  items.map((item) =>
                    item.id === template.id ? { ...item, pattern: event.target.value } : item,
                  ),
                )
              }
              placeholder="{{firstName}}{{dateOfBirth}}"
            />
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={template.enabled}
                onChange={(event) =>
                  setTemplates((items) =>
                    items.map((item) =>
                      item.id === template.id ? { ...item, enabled: event.target.checked } : item,
                    ),
                  )
                }
              />{" "}
              Enabled
            </label>
          </div>
        ))}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving securely…" : "Save PDF password settings"}
      </Button>
    </div>
  );
}
