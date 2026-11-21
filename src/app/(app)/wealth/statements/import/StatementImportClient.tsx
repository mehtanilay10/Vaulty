"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { csrfHeaders } from "@/lib/csrf-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Upload,
  FileText,
  X,
  Loader2,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { WealthAccountDTO } from "@/types";

type StatementTransaction = {
  date: string;
  description: string;
  amount: number;
  type: "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "TRANSFER_IN" | "TRANSFER_OUT";
  referenceNumber?: string | null;
};

interface StatementImportClientProps {
  accounts: WealthAccountDTO[];
}

export function StatementImportClient({ accounts }: StatementImportClientProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [extractedContent, setExtractedContent] = useState("");
  const [format, setFormat] = useState<"csv" | "text">("text");
  const [accountId, setAccountId] = useState("");
  const [parsed, setParsed] = useState<StatementTransaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message?: string } | null>(
    null,
  );
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [showRawPreview, setShowRawPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadedFilename(file.name);
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    setFormat(ext === ".csv" ? "csv" : "text");
    setErrors([]);
    setImportResult(null);
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Unified Submit & Parse workflow
  const handleSubmitAndParse = useCallback(async () => {
    if (!selectedFile) {
      setErrors(["Please select a statement file first."]);
      return;
    }

    setErrors([]);
    setImportResult(null);
    setIsProcessing(true);

    try {
      // Step 1: Upload & Decrypt statement file
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (password.trim()) {
        formData.append("password", password.trim());
      }

      const uploadRes = await fetch("/api/wealth/statements/upload", {
        method: "POST",
        headers: csrfHeaders(),
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Failed to upload and extract statement content.");
      }

      const content = uploadData.content || "";
      const detectedFormat = (uploadData.format as "csv" | "text") || "text";
      setExtractedContent(content);
      setFormat(detectedFormat);
      setUploadedFilename(uploadData.filename || selectedFile.name);

      // Step 2: Automatically parse transactions from extracted content
      const parseRes = await fetch("/api/wealth/statements/parse", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ content, format: detectedFormat }),
      });

      const parseData = await parseRes.json();
      if (!parseRes.ok) {
        throw new Error(parseData.error || "Failed to parse statement transactions.");
      }

      const rawTransactions = parseData.transactions || [];
      const parsedTransactions: StatementTransaction[] = rawTransactions.map((t: unknown) => {
        const x = t as {
          date: string;
          description?: string;
          amount: number | string;
          type: StatementTransaction["type"];
          referenceNumber?: string | null;
        };
        return {
          date: x.date,
          description: x.description || "",
          amount: Number(x.amount) || 0,
          type: x.type,
          referenceNumber: x.referenceNumber || null,
        };
      });

      setParsed(parsedTransactions);
      if (parseData.errors?.length) {
        setErrors(parseData.errors);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Failed to process statement."]);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, password]);

  const handleImport = useCallback(async () => {
    if (!accountId) {
      setErrors(["Please select an account to import transactions into."]);
      return;
    }
    if (parsed.length === 0) {
      setErrors(["No transactions to import."]);
      return;
    }
    setIsImporting(true);
    setErrors([]);
    try {
      const res = await fetch("/api/wealth/statements/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ accountId, transactions: parsed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to import transactions.");
      }
      const data = await res.json();
      setImportResult({
        success: true,
        message: `Successfully imported ${data.count ?? parsed.length} transactions into account!`,
      });
      setParsed([]);
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : "Import failed. Please try again.",
      });
    } finally {
      setIsImporting(false);
    }
  }, [accountId, parsed]);

  const handleRowChange = (index: number, field: keyof StatementTransaction, value: string) => {
    setParsed((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value as unknown as StatementTransaction[keyof StatementTransaction],
      };
      return next;
    });
  };

  const resetFlow = () => {
    setSelectedFile(null);
    setPassword("");
    setExtractedContent("");
    setUploadedFilename("");
    setFormat("text");
    setErrors([]);
    setImportResult(null);
    setParsed([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isFileSelected = Boolean(selectedFile);
  const selectedAccount = accounts.find((a) => a.id === accountId);

  // Stats for parsed transactions
  const totalInflow = parsed
    .filter((t) => t.type === "DEPOSIT" || t.type === "TRANSFER_IN")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalOutflow = parsed
    .filter((t) => t.type === "WITHDRAWAL" || t.type === "PAYMENT" || t.type === "TRANSFER_OUT")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6">
      {/* Informative Password Auto-Decryption Callout */}
      <div className="rounded-2xl border border-brand/20 bg-brand-subtle/40 p-4 sm:p-5 flex items-start gap-3.5">
        <div className="h-9 w-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-1.5 min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">
            Automated PDF Statement Decryption
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Vaulty automatically tests passwords generated from your saved profile details (First
            Name, Last Name, Date of Birth, PAN, and Mobile) using templates configured in{" "}
            <Link
              href="/settings"
              className="font-medium text-brand hover:underline inline-flex items-center gap-0.5"
            >
              Settings → Security → Financial PDF password templates
            </Link>
            . If your statement is encrypted with standard bank formats, you don&apos;t need to
            manually enter a password.
          </p>
        </div>
      </div>

      {/* Main Upload & Configuration Card */}
      <Card className="p-5 sm:p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Select Statement File</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Supported formats: PDF bank statements, CSV, Excel spreadsheets (.xlsx, .xls), and plain
            text.
          </p>
        </div>

        {/* Dropzone / File Picker */}
        <div
          onClick={triggerFilePicker}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
            isFileSelected
              ? "border-brand/40 bg-brand/5 hover:border-brand/60"
              : "border-border hover:border-text-muted bg-surface-muted/30 hover:bg-surface-muted/60"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.xls,.xlsx,.pdf"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
            aria-label="Select bank statement file"
          />

          <div className="flex flex-col items-center justify-center gap-2.5">
            <div
              className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                isFileSelected ? "bg-brand/15 text-brand" : "bg-surface-muted text-text-muted"
              }`}
            >
              {isFileSelected ? (
                selectedFile?.name.endsWith(".csv") || selectedFile?.name.endsWith(".xlsx") ? (
                  <FileSpreadsheet className="h-6 w-6" />
                ) : (
                  <FileText className="h-6 w-6" />
                )
              ) : (
                <Upload className="h-6 w-6" />
              )}
            </div>

            {isFileSelected ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-text-primary break-all">
                  {uploadedFilename}
                </p>
                <p className="text-xs text-text-muted">
                  {((selectedFile?.size || 0) / 1024).toFixed(1)} KB • Click to choose a different
                  file
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-primary">
                  Click or drag and drop your bank statement here
                </p>
                <p className="text-xs text-text-muted">
                  PDF, CSV, Excel, or Text statements up to 25 MB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Options Grid (Destination Account & Optional Password) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Target Wealth Account */}
          <div className="space-y-1.5">
            <Label htmlFor="account-select">
              Destination Account{" "}
              <span className="text-text-muted font-normal">
                (optional now, required to import)
              </span>
            </Label>
            <select
              id="account-select"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input h-10 w-full text-xs sm:text-sm bg-surface border border-border-subtle rounded-xl px-3"
            >
              <option value="">Select target account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type} • {a.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Optional Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password-input">
              Custom Statement Password{" "}
              <span className="text-text-muted font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for automatic decryption"
                className="pl-9 h-10 text-xs sm:text-sm rounded-xl"
              />
            </div>
            <p className="text-[11px] text-text-muted">
              Only required if your PDF uses a non-standard password not covered by your profile
              templates.
            </p>
          </div>
        </div>

        {/* Primary Action: Submit & Parse Statement Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            {isFileSelected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFlow}
                disabled={isProcessing || isImporting}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear Selection
              </Button>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleSubmitAndParse}
            disabled={!isFileSelected || isProcessing}
            className="h-11 px-6 rounded-xl font-medium shadow-sm flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Decrypting & Parsing Statement...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                <span>Submit & Parse Statement</span>
                <ArrowRight className="h-4 w-4 ml-0.5" />
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Errors Alert */}
      {errors.length > 0 && (
        <Alert variant="danger">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-xs">Statement Processing Notice</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                {errors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </Alert>
      )}

      {/* Success Result Alert */}
      {importResult && (
        <Alert variant={importResult.success ? "default" : "danger"}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-medium">{importResult.message}</span>
            </div>
            {importResult.success && accountId && (
              <Link href={`/wealth/accounts/${accountId}`}>
                <Button size="sm" variant="secondary" className="text-xs h-7">
                  View Account
                </Button>
              </Link>
            )}
          </div>
        </Alert>
      )}

      {/* Parsed Transactions Section */}
      {parsed.length > 0 && (
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">Parsed Transactions</h3>
                <Badge variant="default" className="font-mono text-xs">
                  {parsed.length} rows
                </Badge>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Review dates, descriptions, and amounts before importing into your wealth ledger.
              </p>
            </div>

            {/* Inflow / Outflow Summary */}
            <div className="flex items-center gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                Inflows: +{totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-surface-muted text-text-secondary font-medium">
                Outflows: -{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Account Selection Banner if not yet selected */}
          {!accountId && (
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
              <span>
                Please select the target Wealth Account to import these transactions into:
              </span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="input h-8 text-xs bg-surface border border-amber-500/30 rounded-lg px-2"
              >
                <option value="">Choose account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Table */}
          <div className="border border-border-subtle rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface-muted/60 border-b border-border-subtle">
                  <th className="px-3.5 py-2.5 text-text-muted font-semibold w-28">Date</th>
                  <th className="px-3.5 py-2.5 text-text-muted font-semibold min-w-[200px]">
                    Description
                  </th>
                  <th className="px-3.5 py-2.5 text-text-muted font-semibold text-right w-32">
                    Amount
                  </th>
                  <th className="px-3.5 py-2.5 text-text-muted font-semibold w-32">Type</th>
                  <th className="px-3.5 py-2.5 text-text-muted font-semibold w-28">Ref No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {parsed.map((t, i) => {
                  const isInflow = t.type === "DEPOSIT" || t.type === "TRANSFER_IN";
                  return (
                    <tr key={i} className="hover:bg-surface-muted/30 transition-colors">
                      <td className="px-3.5 py-2">
                        <Input
                          value={t.date}
                          onChange={(e) => handleRowChange(i, "date", e.target.value)}
                          className="h-7 bg-transparent border-0 p-1 text-xs focus:bg-surface focus:border-border-subtle"
                        />
                      </td>
                      <td className="px-3.5 py-2">
                        <Input
                          value={t.description}
                          onChange={(e) => handleRowChange(i, "description", e.target.value)}
                          className="h-7 bg-transparent border-0 p-1 text-xs focus:bg-surface focus:border-border-subtle"
                        />
                      </td>
                      <td className="px-3.5 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={String(t.amount)}
                          onChange={(e) => handleRowChange(i, "amount", e.target.value)}
                          className={`h-7 bg-transparent border-0 p-1 text-xs text-right font-medium focus:bg-surface focus:border-border-subtle ${
                            isInflow
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-text-primary"
                          }`}
                        />
                      </td>
                      <td className="px-3.5 py-2">
                        <select
                          value={t.type}
                          onChange={(e) => handleRowChange(i, "type", e.target.value)}
                          className="h-7 bg-transparent border border-transparent rounded px-1 text-xs text-text-primary focus:bg-surface focus:border-border-subtle"
                        >
                          <option value="DEPOSIT">Deposit</option>
                          <option value="WITHDRAWAL">Withdrawal</option>
                          <option value="PAYMENT">Payment</option>
                          <option value="TRANSFER_IN">Transfer In</option>
                          <option value="TRANSFER_OUT">Transfer Out</option>
                        </select>
                      </td>
                      <td className="px-3.5 py-2">
                        <Input
                          value={t.referenceNumber || ""}
                          onChange={(e) => handleRowChange(i, "referenceNumber", e.target.value)}
                          placeholder="—"
                          className="h-7 bg-transparent border-0 p-1 text-xs text-text-muted focus:bg-surface focus:border-border-subtle"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setParsed([])}
              className="text-xs text-text-muted"
            >
              Discard Parsed Data
            </Button>

            <Button
              size="lg"
              onClick={handleImport}
              disabled={isImporting || !accountId}
              className="h-11 px-6 rounded-xl font-medium shadow-sm flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Importing Transactions...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Import {parsed.length} Transactions
                    {selectedAccount ? ` into ${selectedAccount.name}` : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Extracted Raw Content Preview (Expandable) */}
      {extractedContent && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowRawPreview((prev) => !prev)}
            className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1.5"
          >
            <span>
              {showRawPreview ? "Hide" : "Show"} raw extracted statement text (
              {format.toUpperCase()})
            </span>
          </button>

          {showRawPreview && (
            <Card className="mt-3 p-4 bg-surface-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-primary">Raw Extracted Text</span>
                <span className="text-[11px] text-text-muted">
                  {extractedContent.length} characters
                </span>
              </div>
              <pre className="bg-surface border border-border-subtle rounded-xl p-3 max-h-60 overflow-auto font-mono text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                {extractedContent.substring(0, 10000)}
                {extractedContent.length > 10000 ? "\n... (truncated preview)" : ""}
              </pre>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
