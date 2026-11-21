"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface UploadContextValue {
  isOpen: boolean;
  openUpload: (folderId?: string | unknown) => void;
  closeUpload: () => void;
  isCameraOpen: boolean;
  openCamera: (folderId?: string | unknown) => void;
  closeCamera: () => void;
  activeFolderId?: string;
}

const UploadContext = createContext<UploadContextValue | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);

  const openUpload = useCallback((folderId?: string | unknown) => {
    setActiveFolderId(typeof folderId === "string" ? folderId : undefined);
    setIsOpen(true);
  }, []);

  const closeUpload = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openCamera = useCallback((folderId?: string | unknown) => {
    setActiveFolderId(typeof folderId === "string" ? folderId : undefined);
    setIsCameraOpen(true);
  }, []);

  const closeCamera = useCallback(() => {
    setIsCameraOpen(false);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        isOpen,
        openUpload,
        closeUpload,
        isCameraOpen,
        openCamera,
        closeCamera,
        activeFolderId,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used within UploadProvider");
  return context;
}
