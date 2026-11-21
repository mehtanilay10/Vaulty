"use client";

import { Badge } from "@/components/ui/Badge";
import { Loader2, XCircle, CheckCircle2, Clock } from "lucide-react";

interface AiStatusBadgeProps {
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  errorMessage?: string | null;
  showQueueTime?: boolean;
}

export function AiStatusBadge({ status, createdAt, showQueueTime = false }: AiStatusBadgeProps) {
  if (!status) return null;

  switch (status) {
    case "PROCESSING":
      return (
        <Badge variant="warning" className="text-[10px]">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="danger" className="text-[10px]">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "COMPLETED":
      return (
        <Badge variant="success" className="text-[10px]">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          AI Ready
        </Badge>
      );
    case "QUEUED":
      return (
        <div className="flex flex-col items-end gap-0.5">
          <Badge variant="info" className="text-[10px]">
            <Clock className="w-3 h-3 mr-1" />
            Queued
          </Badge>
          {showQueueTime && createdAt && (
            <span className="text-[9px] text-text-muted">
              Queued at{" "}
              {new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      );
    default:
      return null;
  }
}
