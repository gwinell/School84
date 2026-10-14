"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Accept, type FileRejection, useDropzone } from "react-dropzone";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import {
  RenderEmptyState,
  RenderErrorState,
  RenderImageState,
  RenderUploadingState,
  RenderVideoState,
} from "./RenderState";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

interface iUploaderState {
  id: string | null;
  file: File | null;
  uploading: boolean;
  progress: number;
  key?: string;
  isDeleting: boolean;
  error: boolean;
  objectUrl?: string;
  fileType: "image" | "video";
  isInitial?: boolean;
}

interface UploaderProps {
  courseId?: string;
  onUploadComplete?: (key: string) => void;
  fileType?: "image" | "video";
  initialPreviewUrl?: string | null;
  initialKey?: string | null;
  onRemoveInitial?: () => void;
}

const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export function Uploader({
  courseId,
  onUploadComplete,
  fileType = "image",
  initialPreviewUrl = null,
  initialKey = null,
  onRemoveInitial,
}: UploaderProps) {
  const maxSize = fileType === "video" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  const maxSizeLabel = fileType === "video" ? "100MB" : "3MB";

  const [fileState, setFileState] = useState<iUploaderState>(() => {
    if (initialPreviewUrl) {
      return {
        error: false,
        file: null,
        id: null,
        uploading: false,
        progress: 0,
        isDeleting: false,
        fileType,
        objectUrl: initialPreviewUrl,
        key: initialKey ?? undefined,
        isInitial: true,
      };
    }
    return {
      error: false,
      file: null,
      id: null,
      uploading: false,
      progress: 0,
      isDeleting: false,
      fileType,
    };
  });

  const pendingKeysRef = useRef<Set<string>>(new Set());

  const discardPending = useCallback(() => {
    const keys = Array.from(pendingKeysRef.current);
    pendingKeysRef.current.clear();
    if (keys.length === 0) return;
    try {
      const blob = new Blob([JSON.stringify({ keys, ...(courseId ? { courseId } : {}) })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/s3/discard-upload", blob);
    } catch {
      // Best-effort cleanup; ignore beacon failures.
    }
  }, [courseId]);

  const uploadFile = useCallback(
    async (file: File) => {
      setFileState((prev) => ({
        ...prev,
        uploading: true,
        progress: 0,
      }));

      try {
        const response = await fetch("/api/s3/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            isImage: fileType === "image",
            ...(courseId ? { courseId } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to upload file");
        }

        const { presignedUrl, key } = await response.json();

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentageCompleted = (event.loaded / event.total) * 100;
              setFileState((prev) => ({
                ...prev,
                progress: Math.round(percentageCompleted),
              }));
            }
          };
          xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 204) {
              setFileState((prev) => ({
                ...prev,
                uploading: false,
                progress: 100,
                error: false,
                key,
              }));

              pendingKeysRef.current.add(key);
              onUploadComplete?.(key);
              toast.success("File uploaded successfully");
              resolve(xhr.response);
            } else {
              reject(xhr.response);
            }
          };
          xhr.onerror = () => {
            reject(xhr.response);
          };
          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to upload file");

        setFileState((prev) => {
          if (prev.objectUrl && !prev.objectUrl.startsWith("http")) {
            URL.revokeObjectURL(prev.objectUrl);
          }
          return {
            ...prev,
            uploading: false,
            progress: 0,
            error: true,
            objectUrl: undefined,
            file: null,
            key: undefined,
            id: null,
          };
        });
      }
    },
    [courseId, fileType, onUploadComplete],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];

        if (fileState.objectUrl && !fileState.objectUrl.startsWith("http")) {
          URL.revokeObjectURL(fileState.objectUrl);
        }

        if (fileState.key) {
          pendingKeysRef.current.delete(fileState.key);
        }

        setFileState({
          file,
          uploading: true,
          progress: 0,
          objectUrl: URL.createObjectURL(file),
          error: false,
          id: uuidv4(),
          isDeleting: false,
          fileType,
          isInitial: false,
        });

        uploadFile(file);
      }
    },
    [fileState.objectUrl, fileState.key, fileType, uploadFile],
  );

  const handleRemoveFile = useCallback(async () => {
    if (fileState.isDeleting || !fileState.objectUrl) return;

    if (fileState.isInitial) {
      onRemoveInitial?.();
      setFileState((prev) => ({
        ...prev,
        objectUrl: undefined,
        key: undefined,
        isInitial: false,
      }));
      return;
    }

    try {
      setFileState((prev) => ({
        ...prev,
        isDeleting: true,
      }));

      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: fileState.key, ...(courseId ? { courseId } : {}) }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete file");
      }

      if (fileState.objectUrl && !fileState.objectUrl.startsWith("http")) {
        URL.revokeObjectURL(fileState.objectUrl);
      }

      if (fileState.key) {
        pendingKeysRef.current.delete(fileState.key);
      }

      setFileState(() => ({
        file: null,
        isDeleting: false,
        error: false,
        objectUrl: undefined,
        fileType,
        id: null,
        progress: 0,
        uploading: false,
      }));

      toast.success("File deleted successfully");
    } catch {
      toast.error("Failed to delete file");

      setFileState((prev) => ({
        ...prev,
        isDeleting: false,
        error: true,
      }));
    }
  }, [courseId, fileState, fileType, onRemoveInitial]);

  function rejectefFiles(fileRejection: FileRejection[]) {
    if (fileRejection.length) {
      const tooManyFiles = fileRejection.find(
        (rejection) => rejection.errors[0].code === "too-many-files",
      );

      if (tooManyFiles) {
        toast.error("Too many files selected, max is 1");
      }

      const fileSizeTooBig = fileRejection.find(
        (rejection) => rejection.errors[0].code === "file-too-large",
      );

      if (fileSizeTooBig) {
        toast.error(`File too big, max is ${maxSizeLabel}`);
      }
    }
  }

  function renderContent() {
    if (fileState.uploading) {
      return <RenderUploadingState progress={fileState.progress} />;
    }

    if (fileState.error) {
      return <RenderErrorState />;
    }

    if (fileState.objectUrl) {
      if (fileState.fileType === "video") {
        return (
          <RenderVideoState
            objectUrl={fileState.objectUrl}
            isDeleting={fileState.isDeleting}
            handleRemoveFile={handleRemoveFile}
          />
        );
      }

      return (
        <RenderImageState
          objectUrl={fileState.objectUrl}
          isDeleting={fileState.isDeleting}
          handleRemoveFile={handleRemoveFile}
        />
      );
    }

    return <RenderEmptyState isDragActive={isDragActive} fileType={fileType} />;
  }

  useEffect(() => {
    return () => {
      if (fileState.objectUrl && !fileState.objectUrl.startsWith("http")) {
        URL.revokeObjectURL(fileState.objectUrl);
      }
      discardPending();
    };
  }, [fileState.objectUrl, discardPending]);

  const accept: Accept =
    fileType === "video"
      ? { "video/*": [".mp4", ".mov", ".webm", ".mkv", ".avi"] }
      : { "image/*": [] };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    multiple: false,
    maxSize,
    onDropRejected: rejectefFiles,
    disabled:
      fileState.uploading ||
      (!!fileState.objectUrl && !fileState.isInitial),
  });

  return (
    <Card
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed transition-colors duration-200 ease-in-out w-full h-64",
        isDragActive
          ? "border-primary bg-primary/10 border-solid"
          : "border-border hover:border-primary",
      )}
    >
      <CardContent className="flex items-center justify-center h-full w-full">
        <input {...getInputProps()} />

        {renderContent()}
      </CardContent>
    </Card>
  );
}
