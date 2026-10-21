"use client";
import { useEffect } from "react";
import { toast } from "sonner";

const KEY = "rayed_flash";

/** Full navigation that shows `message` as a success toast on the next page. */
export function navigateWithFlash(url: string, message?: string) {
  try {
    if (message) sessionStorage.setItem(KEY, message);
  } catch {
    /* storage unavailable (private mode): navigate without the toast */
  }
  window.location.assign(url);
}

export function FlashToast() {
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(KEY);
      if (!m) return;
      sessionStorage.removeItem(KEY);
      toast.success(m);
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
