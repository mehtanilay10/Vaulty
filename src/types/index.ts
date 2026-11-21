import type {
  User,
  Document,
  Folder,
  AiProcessing,
  AiJob,
  Tag,
  StorageConnection,
  SyncEvent,
  ChatSession,
  ShareLink,
} from "@prisma/client";

export type {
  User,
  Document,
  Folder,
  AiProcessing,
  AiJob,
  Tag,
  StorageConnection,
  SyncEvent,
  ChatSession,
  ShareLink,
};

export interface DocumentWithRelations extends Document {
  folder?: {
    id: string;
    name: string;
    parent?: { id: string; name: string } | null;
  } | null;
  tags: (DocumentTag & { tag: Tag })[];
  aiProcessing?: Partial<AiProcessing> | null;
  shareLinks?: { id: string }[];
  owner?: {
    id: string;
    name: string | null;
    email?: string | null;
    image: string | null;
  } | null;
}

export interface DocumentTag {
  documentId: string;
  tagId: string;
  document: Document;
  tag: Tag;
}

export interface FolderWithCounts extends Folder {
  _count?: {
    documents: number;
    children: number;
  };
  shares?: FolderShare[];
  children?: FolderWithCounts[];
  documents?: DocumentWithRelations[];
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

export interface FolderShare {
  id: string;
  permission: string;
  sharedWith: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

export interface AiProcessingWithDocument extends AiProcessing {
  document: Document;
}

export interface SyncEventWithDocument extends SyncEvent {
  document?: {
    id: string;
    name: string;
  } | null;
  folder?: {
    id: string;
    name: string;
  } | null;
}

export interface StatsResponse {
  totalFolders: number;
  totalDocuments: number;
  aiProcessed: number;
  aiQueued: number;
  aiProcessing: number;
  aiFailed: number;
  aiUnprocessed: number;
  worker?: {
    queued: number;
    processing: number;
    failed: number;
    retrying: number;
    oldestQueuedAt: string | null;
    avgProcessingTimeSeconds: number;
    successRate: number;
  };
}

export interface SyncStats {
  synced: number;
  failed: number;
  pending: number;
}

export interface WealthAccountDTO {
  id: string;
  name: string;
  type: string;
  status: string;
  accountNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  currentBalance: number | string;
  currency: string;
  creditLimit?: number | string | null;
  billingCycle?: string | null;
  dueDate?: number | null;
  isin?: string | null;
  broker?: string | null;
  dematAccount?: string | null;
  loanType?: string | null;
  interestRate?: number | string | null;
  emiAmount?: number | string | null;
  tenureMonths?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  provider?: string | null;
  expiryDate?: string | Date | null;
  pin?: string | null;
  notes?: string | null;
  category?: string | null;
  tags?: string[];
  paymentNotifyDaysBefore?: number[];
  expiryNotifyDaysBefore?: number[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
  transactions?: WealthTransactionDTO[];
  _count?: {
    transactions: number;
  };
}

export interface WealthTransactionDTO {
  id: string;
  accountId: string;
  type: string;
  amount: number | string;
  currency: string;
  description: string;
  referenceNumber?: string | null;
  date: string | Date;
  balanceAfter: number | string;
  category?: string | null;
  subcategory?: string | null;
  units?: number | string | null;
  navPrice?: number | string | null;
  notes?: string | null;
  attachments?: string[];
  account?: {
    id: string;
    name: string;
    type: string;
  };
}
