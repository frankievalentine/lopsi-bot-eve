"use client";

import { ExternalLinkIcon, GitPullRequestIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PullRequest } from "@/lib/github";

/** Shared by the Edit crew member dialog and the New crew member wizard. */

/** Warns before the page is left with unsaved changes. */
export function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}

/** What a crew change shows once its pull request is open. */
export function PullRequestOpened({
  onClose,
  pull,
}: {
  readonly onClose: () => void;
  readonly pull: PullRequest;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Pull Request Opened</DialogTitle>
        <DialogDescription>
          {pull.draft ? "A draft pull request" : "A pull request"} is waiting
          for review. Merging it deploys the change.
        </DialogDescription>
      </DialogHeader>
      <a
        className="hover:bg-accent flex items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors"
        href={pull.url}
        rel="noreferrer"
        target="_blank"
      >
        <GitPullRequestIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate">
          #{pull.number} {pull.title}
        </span>
        <ExternalLinkIcon className="text-muted-foreground size-3.5 shrink-0" />
      </a>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  );
}
