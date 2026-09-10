"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useCountLive(countId: string, enabled: boolean, paused: boolean) {
  const router = useRouter();
  const pausedRef = useRef(paused);
  const skippedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    if (!paused && skippedRef.current) {
      skippedRef.current = false;
      router.refresh();
    }
  }, [paused, router]);

  useEffect(() => {
    if (!enabled || !countId) return;

    const supabase = createClient();
    let debounce: number | null = null;
    let poll: number | null = null;

    const refresh = () => {
      if (pausedRef.current) {
        skippedRef.current = true;
        return;
      }
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        if (pausedRef.current) {
          skippedRef.current = true;
          return;
        }
        router.refresh();
      }, 200);
    };

    const stopPoll = () => {
      if (poll == null) return;
      window.clearInterval(poll);
      poll = null;
    };

    const startPoll = () => {
      if (poll != null) return;
      poll = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        refresh();
      }, 2000);
    };

    const channel = supabase
      .channel(`count:${countId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_count_entries",
          filter: `inventory_count_id=eq.${countId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_count_items",
          filter: `inventory_count_id=eq.${countId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopPoll();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          startPoll();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      stopPoll();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [countId, enabled, router]);
}
