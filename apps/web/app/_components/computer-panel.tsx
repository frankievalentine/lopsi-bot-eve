"use client";

import { type CallState, calls, type SessionView } from "eve/events";
import {
  ChevronRightIcon,
  FileTextIcon,
  MonitorIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CommandRun,
  type ComputerActivity,
  computerActivity,
  type FileEntry,
} from "@/lib/computer-activity";
import { useIsPhone } from "@/lib/use-phone";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/when";

/** Opens the chat's computer panel: what its sandbox ran and the files it touched. */
export function ComputerButton({
  activity,
  onToggle,
  open,
}: {
  readonly activity: ComputerActivity;
  readonly onToggle: () => void;
  readonly open: boolean;
}) {
  const count = activity.commands.length + activity.files.length;
  return (
    <Button
      aria-label="Computer"
      aria-pressed={open}
      className="relative"
      onClick={onToggle}
      size="icon-sm"
      title="Computer: commands and files"
      variant={open ? "secondary" : "ghost"}
    >
      <MonitorIcon className="size-4" />
      {count > 0 && !open ? (
        <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" />
      ) : null}
    </Button>
  );
}

const STATE_LABEL: Partial<Record<CallState, string>> = {
  approval: "needs approval",
  blocked: "waiting",
  cancelled: "stopped",
  failed: "failed",
  rejected: "denied",
  requested: "starting",
  running: "running",
};

function statusOf(run: CommandRun): {
  label: string;
  tone: "default" | "destructive" | "secondary";
} {
  if (run.running) {
    return { label: "running", tone: "secondary" };
  }
  if (run.state === "completed") {
    return run.exitCode === 0 || run.exitCode === undefined
      ? { label: "done", tone: "secondary" }
      : { label: `exit ${run.exitCode}`, tone: "destructive" };
  }
  return {
    label: STATE_LABEL[run.state] ?? run.state,
    tone: run.state === "failed" ? "destructive" : "secondary",
  };
}

/** A command the header row cuts off. */
const LONG_COMMAND = 48;

function Output({
  label,
  text,
  wrap = false,
}: {
  readonly label?: string;
  readonly text: string;
  /** Wrap long lines (file text); terminal output keeps its columns and scrolls. */
  readonly wrap?: boolean;
}) {
  return (
    <div className="space-y-1">
      {label ? (
        <p className="text-muted-foreground text-[11px] font-medium uppercase">
          {label}
        </p>
      ) : null}
      <pre
        className={cn(
          "bg-muted/50 max-h-72 overflow-auto rounded-md p-2.5 font-mono text-xs leading-relaxed",
          wrap
            ? "[overflow-wrap:anywhere] whitespace-pre-wrap"
            : "whitespace-pre"
        )}
      >
        {text}
      </pre>
    </div>
  );
}

function Note({ children }: { readonly children: string }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

function CommandItem({ run }: { readonly run: CommandRun }) {
  const status = statusOf(run);
  const hasOutput = Boolean(run.stdout || run.stderr);
  return (
    <Collapsible className="group/command rounded-lg border">
      <CollapsibleTrigger className="hover:bg-accent/50 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left">
        <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0 transition-transform group-data-[open]/command:rotate-90" />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          $ {run.command}
        </code>
        <Badge variant={status.tone}>{status.label}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-2.5 pb-2.5">
        {run.command.length > LONG_COMMAND ? (
          <Output text={run.command} wrap />
        ) : null}
        {run.stdout ? <Output label="Output" text={run.stdout} /> : null}
        {run.stderr ? <Output label="Errors" text={run.stderr} /> : null}
        {run.error ? <Note>{run.error}</Note> : null}
        {run.truncated ? <Note>The output was cut short.</Note> : null}
        {run.stored ? <Note>The output is too large to show here.</Note> : null}
        {run.running ? (
          <Note>Still running; its output isn't in yet.</Note>
        ) : null}
        {hasOutput ||
        run.error ||
        run.stored ||
        run.running ||
        run.state !== "completed" ? null : (
          <Note>No output.</Note>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FileView({ file }: { readonly file: FileEntry }) {
  if (file.stored) {
    return <Note>This file is too large to show here.</Note>;
  }
  return (
    <div className="space-y-1.5">
      {file.partial ? <Note>Only part of this file was read.</Note> : null}
      <Output text={file.content ?? ""} wrap />
    </div>
  );
}

function FilesTab({ files }: { readonly files: readonly FileEntry[] }) {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const file = files.find((entry) => entry.path === selected) ?? files[0];
  if (file === undefined) {
    return <Note>No files written or read yet.</Note>;
  }
  return (
    <div className="space-y-3">
      <ul className="flex flex-col gap-1">
        {files.map((entry) => (
          <li key={entry.path}>
            <button
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                entry.path === file.path && "bg-accent"
              )}
              onClick={() => setSelected(entry.path)}
              type="button"
            >
              <FileTextIcon className="text-muted-foreground size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {entry.path}
              </span>
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {entry.how}
                {entry.at ? ` ${formatWhen(entry.at)}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <FileView file={file} />
      <Note>
        Files the shell made on its own don't show here, only ones the agent
        wrote or read.
      </Note>
    </div>
  );
}

/** The chat's sandbox: the commands it ran, and the files it wrote or read. */
function ComputerPanel({
  activity,
  className,
  onClose,
}: {
  readonly activity: ComputerActivity;
  readonly className?: string;
  readonly onClose?: () => void;
}) {
  return (
    <aside
      aria-label="Computer"
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <MonitorIcon className="size-4" />
        <span className="flex-1 text-sm font-semibold">Computer</span>
        {onClose ? (
          <Button
            aria-label="Close computer"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </div>
      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="commands">
        <TabsList className="mx-4 mt-3">
          <TabsTrigger value="commands">
            Commands ({activity.commands.length})
          </TabsTrigger>
          <TabsTrigger value="files">
            Files ({activity.files.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0 overflow-auto p-4" value="commands">
          {activity.commands.length === 0 ? (
            <Note>Nothing has run in the shell yet.</Note>
          ) : (
            <div className="flex flex-col gap-2">
              {activity.commands.map((run) => (
                <CommandItem key={run.callId} run={run} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent className="min-h-0 overflow-auto p-4" value="files">
          <FilesTab files={activity.files} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

/** The chat's computer: what its sandbox did, and whether the panel is open. */
export function useComputer(view: SessionView) {
  const [open, setOpen] = useState(false);
  const activity = useMemo(
    () => computerActivity(calls(view, { kind: "tool" })),
    [view]
  );
  return {
    activity,
    close: () => setOpen(false),
    open,
    toggle: () => setOpen((current) => !current),
  };
}

/** The panel beside the chat on wide screens, or full screen on phones. */
export function ComputerSurface({
  activity,
  onClose,
  open,
}: {
  readonly activity: ComputerActivity;
  readonly onClose: () => void;
  readonly open: boolean;
}) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
        <DialogContent
          className="flex h-[90svh] flex-col gap-0 p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Computer</DialogTitle>
          <ComputerPanel
            activity={activity}
            className="flex-1"
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>
    );
  }
  return open ? (
    <ComputerPanel
      activity={activity}
      className="w-[400px] shrink-0 border-l"
      onClose={onClose}
    />
  ) : null;
}
