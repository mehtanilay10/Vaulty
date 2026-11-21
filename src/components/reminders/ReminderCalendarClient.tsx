"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  BellRing,
  FileText,
  CreditCard,
  Clock,
  ExternalLink,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  type: "REMINDER" | "DOCUMENT_EXPIRY" | "CREDIT_CARD_DUE";
  title: string;
  date: string; // YYYY-MM-DD
  link?: string;
  category?: string;
  isCompleted?: boolean;
}

interface ReminderCalendarClientProps {
  events: CalendarEvent[];
  embedded?: boolean;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ReminderCalendarClient({ events, embedded = false }: ReminderCalendarClientProps) {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(() => today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    return today.toISOString().slice(0, 10);
  });
  const [filterType, setFilterType] = useState<
    "ALL" | "REMINDER" | "DOCUMENT_EXPIRY" | "CREDIT_CARD_DUE"
  >("ALL");

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(today.toISOString().slice(0, 10));
  };

  // Build grid days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sun

    const days: Array<{
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Prev month padding
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, d);
      days.push({
        dateString: prevDate.toISOString().slice(0, 10),
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month
    const todayStr = today.toISOString().slice(0, 10);
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(currentYear, currentMonth, i);
      const dateString = date.toISOString().slice(0, 10);
      days.push({
        dateString,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
      });
    }

    // Next month padding to complete 35 or 42 cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(currentYear, currentMonth + 1, i);
      days.push({
        dateString: nextDate.toISOString().slice(0, 10),
        dayNumber: i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  }, [currentYear, currentMonth, today]);

  // Index events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      if (filterType !== "ALL" && evt.type !== filterType) continue;
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    }
    return map;
  }, [events, filterType]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDate.get(selectedDate) || [];
  }, [selectedDate, eventsByDate]);

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Calendar View"
          description="Unified schedule of your upcoming reminders, document renewals, and payment due dates."
          actions={
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-muted p-0.5">
                <Link
                  href="/reminders"
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </Link>
                <span className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-text-primary shadow-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Calendar
                </span>
              </div>
            </div>
          }
        />
      )}

      {/* Filter and Month Navigation Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary min-w-[160px]">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={prevMonth}
                aria-label="Previous month"
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToToday} className="h-8 text-xs">
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={nextMonth}
                aria-label="Next month"
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterType("ALL")}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium transition-colors",
                filterType === "ALL"
                  ? "bg-brand text-white"
                  : "bg-surface-muted text-text-muted hover:text-text-primary",
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType("REMINDER")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
                filterType === "REMINDER"
                  ? "bg-amber-500 text-white"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
              )}
            >
              <BellRing className="h-3 w-3" />
              Reminders
            </button>
            <button
              type="button"
              onClick={() => setFilterType("DOCUMENT_EXPIRY")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
                filterType === "DOCUMENT_EXPIRY"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
              )}
            >
              <FileText className="h-3 w-3" />
              Doc Expiry
            </button>
            <button
              type="button"
              onClick={() => setFilterType("CREDIT_CARD_DUE")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
                filterType === "CREDIT_CARD_DUE"
                  ? "bg-rose-600 text-white"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20",
              )}
            >
              <CreditCard className="h-3 w-3" />
              Card Due
            </button>
          </div>
        </div>
      </Card>

      {/* Monthly Grid */}
      <Card className="overflow-hidden p-0 border border-border-subtle shadow-sm">
        {/* Day Header */}
        <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-muted text-center text-[11px] font-semibold text-text-muted">
          {DAY_NAMES.map((name) => (
            <div key={name} className="py-2.5">
              {name}
            </div>
          ))}
        </div>

        {/* Days Matrix */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border-subtle">
          {calendarDays.map((day) => {
            const dayEvents = eventsByDate.get(day.dateString) || [];
            const isSelected = selectedDate === day.dateString;

            return (
              <div
                key={day.dateString}
                onClick={() => setSelectedDate(day.dateString)}
                className={cn(
                  "min-h-[90px] sm:min-h-[110px] p-1.5 transition-colors cursor-pointer flex flex-col justify-between",
                  !day.isCurrentMonth && "bg-surface-muted/40 opacity-40",
                  isSelected && "bg-brand/5 ring-1 ring-inset ring-brand",
                  day.isCurrentMonth && !isSelected && "hover:bg-surface-muted/60",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      day.isToday
                        ? "bg-brand text-white font-bold"
                        : isSelected
                          ? "font-bold text-brand"
                          : "text-text-primary",
                    )}
                  >
                    {day.dayNumber}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-semibold text-text-muted">
                      {dayEvents.length}
                    </span>
                  )}
                </div>

                {/* Event Chips (max 2 visible on cell) */}
                <div className="mt-1 space-y-1 overflow-hidden">
                  {dayEvents.slice(0, 2).map((evt) => {
                    const isReminder = evt.type === "REMINDER";
                    const isDoc = evt.type === "DOCUMENT_EXPIRY";

                    return (
                      <div
                        key={evt.id}
                        title={evt.title}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-[10px] font-medium border leading-tight flex items-center gap-1",
                          isReminder &&
                            "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
                          isDoc &&
                            "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20",
                          evt.type === "CREDIT_CARD_DUE" &&
                            "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/20",
                        )}
                      >
                        <span className="shrink-0">
                          {isReminder ? (
                            <Clock className="h-2.5 w-2.5" />
                          ) : isDoc ? (
                            <FileText className="h-2.5 w-2.5" />
                          ) : (
                            <CreditCard className="h-2.5 w-2.5" />
                          )}
                        </span>
                        <span className="truncate">{evt.title}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <div className="text-[10px] text-text-muted font-medium px-1">
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Selected Date Detail Drawer */}
      {selectedDate && (
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">
                Events for{" "}
                {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
            </div>
            <Badge variant="default" className="text-xs">
              {selectedDateEvents.length} item{selectedDateEvents.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {selectedDateEvents.length === 0 ? (
            <p className="pt-4 text-xs text-text-muted">
              No scheduled dues or reminders on this date.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {selectedDateEvents.map((evt) => {
                const isReminder = evt.type === "REMINDER";
                const isDoc = evt.type === "DOCUMENT_EXPIRY";

                return (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border-subtle bg-surface-muted/50 hover:bg-surface transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          isReminder &&
                            "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
                          isDoc &&
                            "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
                          evt.type === "CREDIT_CARD_DUE" &&
                            "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
                        )}
                      >
                        {isReminder ? (
                          <BellRing className="h-4 w-4" />
                        ) : isDoc ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate">
                          {evt.title}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {isReminder
                            ? `Reminder · ${evt.category || "General"}`
                            : isDoc
                              ? "Document Renewal / Expiry"
                              : "Credit Card Payment Due"}
                        </p>
                      </div>
                    </div>

                    {evt.link && (
                      <Link href={evt.link}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                          <span>View</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
