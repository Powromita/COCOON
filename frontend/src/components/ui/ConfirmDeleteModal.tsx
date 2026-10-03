"use client";

import { useEffect, useRef } from "react";
import Button from "./Button";
import { T } from "@/lib/i18n";

export type ConfirmDeleteModalProps = {
  isOpen: boolean;
  title: string;
  itemName?: string;
  itemType?: "project" | "result";
  description?: string;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

export default function ConfirmDeleteModal({
  isOpen,
  title,
  itemName,
  itemType = "project",
  description,
  errorMessage,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDeleteModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !loading) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-line shadow-2xl p-6 flex flex-col gap-4 transform transition-all animate-scale-up"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-error-container/30 border border-error-container text-error flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">delete_forever</span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="text-base font-bold text-on-surface leading-snug">
              <T>{title}</T>
            </h3>
            {itemName && (
              <span className="text-xs font-mono font-bold text-navy bg-surface-container-low px-2 py-0.5 rounded border border-line truncate">
                {itemName}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
          {description ?? (
            itemType === "project" ? (
              <T>
                Are you sure you want to delete this project? All associated simulation results, candidate evaluations, and generated dossiers will be permanently removed.
              </T>
            ) : (
              <T>
                Are you sure you want to delete this saved simulation result? All thermal evaluations, timeseries datasets, and FEA artifacts for this run will be permanently deleted.
              </T>
            )
          )}
        </p>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-error-container/20 border border-error-container/40 flex items-start gap-2.5 text-xs text-error">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <div className="flex flex-col">
              <span className="font-bold">Error</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-surface-container">
          <Button
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={loading}
          >
            <T>Cancel</T>
          </Button>
          <Button
            variant="destructive"
            size="md"
            icon={loading ? "refresh" : "delete"}
            onClick={onConfirm}
            disabled={loading}
          >
            <T>{loading ? "Deleting…" : "Delete"}</T>
          </Button>
        </div>
      </div>
    </div>
  );
}
