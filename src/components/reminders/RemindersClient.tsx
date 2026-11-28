"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  BellRing,
  Calendar,
  CalendarClock,
  Check,
  Circle,
  Clock3,
  CreditCard,
  Edit,
  FileText,
  List,
  Mail,
  Plus,
  Repeat2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { Blade } from "@/components/ui/Blade";
import { MultiSelectPills, type MultiSelectOption } from "@/components/ui/MultiSelectPills";
import {
  ReminderCalendarClient,
  type CalendarEvent,
} from "@/components/reminders/ReminderCalendarClient";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

type Category = "DOCUMENT" | "PAYMENT" | "INSURANCE" | "SUBSCRIPTION" | "PERSONAL";
type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
interface Reminder {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  dueAt: string;
  recurrence: Recurrence;
  notifyDaysBefore: number[];
  notifyInApp: boolean;
  notifyByEmail: boolean;
  isCompleted: boolean;
  createdAt: string;
}

const categoryLabels: Record<Category, string> = {
  DOCUMENT: "Document expiry",
  PAYMENT: "Payment",
  INSURANCE: "Insurance",
  SUBSCRIPTION: "Subscription",
  PERSONAL: "Personal",
};
const recurrenceLabels: Record<Recurrence, string> = {
  NONE: "Does not repeat",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};
const categoryVisuals: Record<Category, { icon: React.ElementType; tone: string }> = {
  DOCUMENT: { icon: FileText, tone: "bg-info-subtle text-info" },
  PAYMENT: { icon: CreditCard, tone: "bg-warning-subtle text-warning" },
  INSURANCE: { icon: ShieldCheck, tone: "bg-success-subtle text-success" },
  SUBSCRIPTION: { icon: Repeat2, tone: "bg-brand-subtle text-brand" },
  PERSONAL: { icon: Bell, tone: "bg-surface-muted text-text-muted" },
};

function dayDistance(date: string) {
  const target = new Date(date);
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function dueLabel(date: string) {
  const days = dayDistance(date);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border-subtle bg-surface p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={title}
        className="mt-0.5"
      />
    </div>
  );
}

function ReminderRow({
  item,
  completed = false,
  onComplete,
  onDelete,
  onEdit,
}: {
  item: Reminder;
  completed?: boolean;
  onComplete: (item: Reminder) => void;
  onDelete: (item: Reminder) => void;
  onEdit: (item: Reminder) => void;
}) {
  const days = dayDistance(item.dueAt);
  const visual = categoryVisuals[item.category];
  const Icon = visual.icon;
  const isFromDocument = item.description && item.description.includes("Extracted from ");
  const documentName =
    isFromDocument && item.description
      ? item.description.match(/Extracted from ([^.]+)/)?.[1]?.trim()
      : null;
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-border-subtle px-4 py-4 transition-colors last:border-0 hover:bg-surface-muted/30",
        completed && "opacity-65",
      )}
    >
      <button
        type="button"
        onClick={() => !completed && onComplete(item)}
        disabled={completed}
        aria-label={`Complete ${item.title}`}
        className="mt-1.5 rounded-full text-text-muted transition-colors hover:text-success disabled:cursor-default"
      >
        {completed ? <Check className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
      </button>
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          visual.tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-semibold text-text-primary", completed && "line-through")}>
            {item.title}
          </p>
          {!completed && (
            <Badge variant={days < 0 ? "danger" : days <= 3 ? "warning" : "default"}>
              {dueLabel(item.dueAt)}
            </Badge>
          )}
          {isFromDocument && (
            <Badge variant="info" className="text-[10px]">
              From document
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-text-muted">
            {isFromDocument && documentName ? `Extracted from ${documentName}` : item.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          <span>{categoryLabels[item.category]}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {new Date(item.dueAt).toLocaleDateString()}
          </span>
          {item.recurrence !== "NONE" && (
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="h-3 w-3" />
              {recurrenceLabels[item.recurrence]}
            </span>
          )}
          {item.notifyByEmail && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Email
            </span>
          )}
          {item.notifyInApp && (
            <span className="inline-flex items-center gap-1">
              <Smartphone className="h-3 w-3" />
              In-app
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!completed && (
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.title}`}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
          >
            <Edit className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.title}`}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const REMINDER_NOTIFY_OPTIONS: MultiSelectOption[] = [
  { value: 0, label: "On due date", hint: "Day 0 (Due date itself)" },
  { value: 1, label: "1 day before", hint: "24 hours before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before", hint: "7 days before" },
  { value: 14, label: "2 weeks before", hint: "14 days before" },
  { value: 30, label: "1 month before", hint: "30 days before" },
];

export function RemindersClient({
  initialReminders,
  initialView = "list",
  hasFamilyReminders = false,
}: {
  initialReminders?: Reminder[];
  initialView?: "list" | "calendar";
  hasFamilyReminders?: boolean;
} = {}) {
  const { confirmAction } = useFeedback();
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<"list" | "calendar">(initialView);
  const [items, setItems] = useState<Reminder[]>(initialReminders ?? []);
  const [loading, setLoading] = useState(initialReminders === undefined);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"upcoming" | "completed">("upcoming");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("PERSONAL");
  const [dueAt, setDueAt] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [notifyDaysBefore, setNotifyDaysBefore] = useState<number[]>([7, 1, 0]);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyByEmail, setNotifyByEmail] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setEditingId(null);
      setTitle("");
      setDescription("");
      setDueAt("");
      setShowForm(true);
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const response = await fetch("/api/reminders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load reminders.");
      setItems(data.reminders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialReminders) {
      queueMicrotask(() => {
        void load(true);
      });
    }
  }, [initialReminders, load]);

  const activeItems = useMemo(() => items.filter((item) => !item.isCompleted), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.isCompleted), [items]);
  const visibleItems = view === "upcoming" ? activeItems : completedItems;

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory("PERSONAL");
    setDueAt("");
    setRecurrence("NONE");
    setNotifyDaysBefore([7, 1, 0]);
    setNotifyInApp(true);
    setNotifyByEmail(true);
    setError("");
  };

  const openEditForm = (item: Reminder) => {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description || "");
    setCategory(item.category);
    setDueAt(item.dueAt.slice(0, 10));
    setRecurrence(item.recurrence);
    setNotifyDaysBefore(item.notifyDaysBefore);
    setNotifyInApp(item.notifyInApp);
    setNotifyByEmail(item.notifyByEmail);
    setError("");
    setShowForm(true);
  };

  const createReminder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!dueAt) throw new Error("Choose a due date.");
      const isEdit = editingId !== null;
      const response = await fetch("/api/reminders", {
        method: isEdit ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          isEdit
            ? {
                id: editingId,
                title,
                description,
                category,
                dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
                recurrence,
                notifyDaysBefore,
                notifyInApp,
                notifyByEmail,
              }
            : {
                title,
                description,
                category,
                dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
                recurrence,
                notifyDaysBefore,
                notifyInApp,
                notifyByEmail,
              },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || (isEdit ? "Could not update reminder." : "Could not create reminder."),
        );
      setShowForm(false);
      resetForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Could not update reminder."
            : "Could not create reminder.",
      );
    } finally {
      setSaving(false);
    }
  };

  const completeReminder = async (item: Reminder) => {
    const response = await fetch("/api/reminders", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: item.id, completed: true }),
    });
    if (response.ok) await load();
  };

  const deleteReminder = async (item: Reminder) => {
    if (
      !(await confirmAction({
        title: "Delete reminder?",
        description: `“${item.title}” will be removed. This cannot be undone.`,
        confirmLabel: "Delete reminder",
        tone: "danger",
      }))
    )
      return;

    const response = await fetch(`/api/reminders?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    if (response.ok) setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return items.map((r) => ({
      id: r.id,
      type: "REMINDER" as const,
      title: r.title,
      date: new Date(r.dueAt).toISOString().slice(0, 10),
      category: r.category,
      isCompleted: r.isCompleted,
    }));
  }, [items]);

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="Reminders" icon={<BellRing className="h-5 w-5" />} />

        <CommandBar
          farItems={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  viewMode === "list"
                    ? "bg-surface-muted text-brand font-semibold"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  viewMode === "calendar"
                    ? "bg-surface-muted text-brand font-semibold"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          }
        >
          <CommandBarButton
            primary
            icon={<Plus className="h-3.5 w-3.5 text-white" />}
            onClick={() => {
              setEditingId(null);
              resetForm();
              setShowForm(true);
            }}
          >
            Add reminder
          </CommandBarButton>
          {hasFamilyReminders && (
            <>
              <CommandBarDivider />
              <CommandBarButton
                icon={<Users className="h-3.5 w-3.5" />}
                item={{
                  key: "family-reminders",
                  label: "Family Reminders",
                  href: "/family/reminders",
                }}
              />
            </>
          )}
        </CommandBar>
      </div>

      {viewMode === "calendar" ? (
        <div className="mt-6">
          <ReminderCalendarClient events={calendarEvents} embedded />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {error && !showForm && <Alert variant="danger">{error}</Alert>}

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Reminder overview">
            <StatCard
              label="Active reminders"
              value={activeItems.length}
              icon={<CalendarClock className="h-4 w-4" />}
              hint="Scheduled"
              tone="brand"
            />
            <StatCard
              label="Due in 7 days"
              value={
                activeItems.filter(
                  (item) => dayDistance(item.dueAt) >= 0 && dayDistance(item.dueAt) <= 7,
                ).length
              }
              icon={<Clock3 className="h-4 w-4" />}
              hint="This week"
              tone="warning"
            />
            <StatCard
              label="Email notifications"
              value={activeItems.filter((item) => item.notifyByEmail).length}
              icon={<BellRing className="h-4 w-4" />}
              hint="Enabled"
              tone="success"
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Card className="overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Your reminders</h2>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {view === "upcoming"
                      ? "Active and scheduled reminders"
                      : "Reminders you have completed"}
                  </p>
                </div>
                <div
                  role="tablist"
                  aria-label="Reminder view"
                  className="inline-flex items-center self-start rounded-lg border border-border-subtle bg-surface-muted/60 p-0.5 sm:self-auto"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "upcoming"}
                    onClick={() => setView("upcoming")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      view === "upcoming"
                        ? "bg-surface text-text-primary shadow-fluent-2"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    Upcoming
                    <span className="rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                      {activeItems.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "completed"}
                    onClick={() => setView("completed")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      view === "completed"
                        ? "bg-surface text-text-primary shadow-fluent-2"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    Completed
                    <span className="rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                      {completedItems.length}
                    </span>
                  </button>
                </div>
              </div>

              {loading && items.length === 0 ? (
                <div className="space-y-4 p-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="skeleton h-9 w-9 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3 w-2/5" />
                        <div className="skeleton h-3 w-1/4" />
                      </div>
                      <div className="skeleton h-6 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : visibleItems.length ? (
                visibleItems.map((item) => (
                  <ReminderRow
                    key={item.id}
                    item={item}
                    completed={view === "completed"}
                    onComplete={completeReminder}
                    onDelete={deleteReminder}
                    onEdit={openEditForm}
                  />
                ))
              ) : (
                <EmptyState
                  icon={
                    view === "upcoming" ? (
                      <CalendarClock className="h-6 w-6" />
                    ) : (
                      <Check className="h-6 w-6" />
                    )
                  }
                  title={
                    view === "upcoming" ? "Nothing on your list yet" : "No completed reminders"
                  }
                  description={
                    view === "upcoming"
                      ? "Add a reminder for a renewal, payment or important date."
                      : "Reminders you complete will appear here."
                  }
                  action={
                    view === "upcoming" ? (
                      <Button
                        onClick={() => {
                          setEditingId(null);
                          resetForm();
                          setShowForm(true);
                        }}
                      >
                        <Plus className="h-4 w-4" /> Add reminder
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Card>

            <aside className="space-y-4">
              <Card className="p-4.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-brand/20 bg-brand-subtle text-brand">
                    <BellRing className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-[13px] font-semibold text-text-primary">
                      Notification channels
                    </h2>
                    <p className="text-[11px] text-text-muted">Managed centrally in settings.</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-muted">
                  Configure delivery channels (email, in-app, browser push) in{" "}
                  <Link href="/settings" className="font-semibold text-brand hover:underline">
                    Settings &rarr; Notification preferences
                  </Link>
                  .
                </p>
              </Card>

              <Card className="bg-surface-muted/40 p-4.5">
                <div className="flex items-start gap-2.5">
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      How reminders are delivered
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                      Vaulty checks scheduled reminders daily. In-app alerts appear in your
                      notification centre; email alerts are sent to your account email when
                      configured. Document expiry and credit-card due-date alerts are generated
                      automatically.
                    </p>
                  </div>
                </div>
              </Card>
            </aside>
          </div>
        </div>
      )}

      <Blade
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? "Edit reminder" : "Create reminder"}
        description={
          editingId
            ? "Update your reminder details."
            : "Set a date and choose when Vaulty should notify you."
        }
        icon={<BellRing className="h-4 w-4" />}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reminder-form"
              disabled={saving || (!notifyInApp && !notifyByEmail)}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create reminder"}
            </Button>
          </>
        }
      >
        <form id="reminder-form" onSubmit={createReminder} className="space-y-5">
          <div>
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Renew health insurance"
            />
          </div>

          <div>
            <Label htmlFor="reminder-description">
              Description <span className="font-normal text-text-muted">(optional)</span>
            </Label>
            <Textarea
              id="reminder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Add a note or reference"
              className="resize-y"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reminder-type">Type</Label>
              <Select
                id="reminder-type"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="reminder-due">Due date</Label>
              <Input
                id="reminder-due"
                required
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="reminder-repeat">Repeat</Label>
            <Select
              id="reminder-repeat"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
            >
              {Object.entries(recurrenceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="reminder-notify-schedule" className="mb-1.5 block">
              Notify me
            </Label>
            <MultiSelectPills
              id="reminder-notify-schedule"
              options={REMINDER_NOTIFY_OPTIONS}
              value={notifyDaysBefore}
              onChange={(vals) => setNotifyDaysBefore(vals as number[])}
              placeholder="Select reminder schedule..."
              badgeClassName="bg-brand-subtle text-brand border-brand/25"
            />
            <p className="mt-1.5 text-[11px] text-text-muted">
              Choose when to be notified. &quot;On due date&quot; alerts you on the due date itself.
            </p>
          </div>

          <div>
            <Label>Channels</Label>
            <div className="space-y-2">
              <PreferenceRow
                icon={<Smartphone className="h-3.5 w-3.5" />}
                title="In-app notification"
                description="Shown in your notification centre."
                checked={notifyInApp}
                onChange={setNotifyInApp}
              />
              <PreferenceRow
                icon={<Mail className="h-3.5 w-3.5" />}
                title="Email notification"
                description="Sent to your account email."
                checked={notifyByEmail}
                onChange={setNotifyByEmail}
              />
            </div>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}
        </form>
      </Blade>
    </>
  );
}
