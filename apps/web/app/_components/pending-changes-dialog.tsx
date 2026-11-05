"use client";

import {
  ExternalLinkIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PullRequest } from "@/lib/github";
import { pendingChanges } from "./config-actions";

/**
 * How many of the dashboard's pull requests are open, for the Pending Changes
 * badge. Refreshed on mount, when the tab regains focus (a merge on GitHub),
 * and when the caller asks; `null` while unknown or unavailable.
 */
export function usePendingCount(enabled: boolean): {
  readonly count: number | null;
  readonly refresh: () => void;
} {
  const [count, setCount] = useState<number | null>(null);
  const latest = useRef(0);
  const refresh = useCallback(() => {
    latest.current += 1;
    const request = latest.current;
    pendingChanges()
      .then((result) => {
        if (request === latest.current) {
          setCount(result.ok ? result.pulls.length : null);
        }
      })
      .catch(() => request === latest.current && setCount(null));
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh]);

  return { count: enabled ? count : null, refresh };
}

/** The dashboard's open pull requests: changes waiting for review and merge. */
export function PendingChangesDialog({
  onOpenChange,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const [pulls, setPulls] = useState<readonly PullRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    setPulls(null);
    setError(null);
    pendingChanges()
      .then((result) => {
        if (!current) {
          return;
        }
        if (result.ok) {
          setPulls(result.pulls);
        } else {
          setError(result.error);
        }
      })
      .catch(() => current && setError("Couldn't load pending changes."));
    return () => {
      current = false;
    };
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pending Changes</DialogTitle>
          <DialogDescription>
            Pull requests opened from the dashboard. Review and merge them on
            GitHub; Vercel deploys the merge.
          </DialogDescription>
        </DialogHeader>
        {pulls === null && error === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : null}
        {pulls?.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing pending.</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {pulls?.map((pull) => {
            const Icon = pull.draft
              ? GitPullRequestDraftIcon
              : GitPullRequestIcon;
            return (
              <li key={pull.number}>
                <a
                  className="hover:bg-accent flex items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors"
                  href={pull.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">
                    #{pull.number} {pull.title}
                  </span>
                  <ExternalLinkIcon className="text-muted-foreground size-3.5 shrink-0" />
                </a>
              </li>
            );
          })}
        </ul>
        {error === null ? null : (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
