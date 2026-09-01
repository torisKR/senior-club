"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ALargeSmall } from "lucide-react";

import { clsx } from "clsx";

const STORAGE_KEY = "club-senior-large-text";
const LARGE_TEXT_CLASS = "large-text";
const PREFERENCE_CHANGE_EVENT = "club-senior-font-size-change";

type FontSizeControlProps = {
  className?: string;
  compact?: boolean;
};

function readSavedPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return document.documentElement.classList.contains(LARGE_TEXT_CLASS);
  }
}

function subscribeToPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PREFERENCE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, onStoreChange);
  };
}

/** Persists the user's large-text preference on this device. */
export function FontSizeControl({ className, compact = false }: FontSizeControlProps) {
  const isLarge = useSyncExternalStore(subscribeToPreference, readSavedPreference, () => false);

  useEffect(() => {
    document.documentElement.classList.toggle(LARGE_TEXT_CLASS, isLarge);
  }, [isLarge]);

  function toggleFontSize() {
    const nextValue = !isLarge;

    document.documentElement.classList.toggle(LARGE_TEXT_CLASS, nextValue);

    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextValue));
    } catch {
      // The setting still works for this page when storage is unavailable.
    }

    window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
  }

  return (
    <button
      aria-label={isLarge ? "기본 글자 크기로 보기" : "글자 크게 보기"}
      aria-pressed={isLarge}
      className={clsx(
        "inline-flex min-h-13 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 font-extrabold no-underline transition-colors",
        "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)] motion-reduce:transition-none",
        isLarge
          ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--primary)] hover:bg-[var(--canvas)]",
        compact ? "px-2.5 text-sm" : "text-[0.9rem]",
        className,
      )}
      onClick={toggleFontSize}
      title={isLarge ? "기본 글자 크기로 보기" : "글자 크게 보기"}
      type="button"
    >
      <ALargeSmall aria-hidden="true" className="size-5" strokeWidth={2.25} />
      <span className={clsx(compact && "hidden min-[390px]:inline")}>글자 크게</span>
      <span className="screen-reader-only">{isLarge ? "켜짐" : "꺼짐"}</span>
    </button>
  );
}
