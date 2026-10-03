"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "./Button";
import { T } from "@/lib/i18n";

export type RenameProjectModalProps = {
  isOpen: boolean;
  currentName: string;
  projectId: string;
  onSave: (newName: string) => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  errorMessage?: string | null;
};

export default function RenameProjectModal({
  isOpen,
  currentName,
  projectId,
  onSave,
  onCancel,
  loading = false,
  errorMessage,
}: RenameProjectModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, currentName]);

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-line shadow-2xl p-6 flex flex-col gap-4 transform transition-all animate-scale-up">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-navy flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">edit</span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="text-base font-bold text-on-surface leading-snug">
              <T>Rename Project / Shelter</T>
            </h3>
            <p className="text-xs text-on-surface-variant font-data">
              ID: {projectId}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="rename-input">
              <T>New Shelter Name</T>
            </label>
            <input
              ref={inputRef}
              id="rename-input"
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Siachen High-Altitude Post"
              className="w-full h-10 px-3.5 rounded-xl border border-line bg-surface-container-lowest text-sm text-on-surface outline-none transition-all focus:border-navy focus:ring-2 focus:ring-navy/10 font-medium"
            />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-error-container/40 border border-error/20 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-surface-container">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={loading}
            >
              <T>Cancel</T>
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !name.trim()}
              icon={loading ? undefined : "check"}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  <T>Saving...</T>
                </span>
              ) : (
                <T>Save Name</T>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
