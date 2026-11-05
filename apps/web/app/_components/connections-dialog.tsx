"use client";

import {
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHelpIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Account } from "./account";
import {
  type ConnectionStatus,
  connectionStatuses,
  disconnect,
} from "./connections-actions";

/** A configured connector, as the browser may know it: no UID. */
export interface ConnectorSummary {
  readonly id: string;
  readonly name: string;
}

const STATE_LABELS: Record<ConnectionStatus["state"], string> = {
  connected: "Connected",
  "not-connected":
    "Not connected. The crew asks you to connect the first time it needs it.",
  unknown: "Couldn't check right now.",
};

function stateLabel(
  state: ConnectionStatus["state"] | undefined,
  canConnect: boolean
): string {
  if (state !== undefined) {
    return STATE_LABELS[state];
  }
  return canConnect ? "Checking…" : "";
}

const STATE_ICONS = {
  connected: CheckCircleIcon,
  "not-connected": CircleDashedIcon,
  unknown: CircleHelpIcon,
} as const;

/**
 * The services the crew can use, and whether the signed-in person has connected
 * their own account to each. Connecting happens in a chat, when the agent first
 * needs a service; this is where to see and revoke it.
 */
export function ConnectionsDialog({
  account,
  connectors,
  onOpenChange,
  open,
}: {
  readonly account: Account;
  readonly connectors: readonly ConnectorSummary[];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const [statuses, setStatuses] = useState<readonly ConnectionStatus[] | null>(
    null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canConnect = account.kind !== "open" && account.kind !== "demo";

  useEffect(() => {
    if (!(open && canConnect)) {
      return;
    }
    let current = true;
    setStatuses(null);
    connectionStatuses()
      .then((result) => current && setStatuses(result))
      .catch(() => current && setError("Couldn't load your connections."));
    return () => {
      current = false;
    };
  }, [open, canConnect]);

  const revoke = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await disconnect(id);
      setStatuses(
        (list) =>
          list?.map((status) =>
            status.id === id ? { id, state: "not-connected" } : status
          ) ?? null
      );
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connections</DialogTitle>
          <DialogDescription>
            {account.kind === "password"
              ? "Services the crew can use. Everyone with the password shares these connections."
              : "Services the crew can use, each with your own account."}
          </DialogDescription>
        </DialogHeader>
        {canConnect ? null : (
          <p className="text-muted-foreground text-sm">
            Local development has no signed-in person to connect an account for.
            Use starter or production mode to try connections.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {connectors.map((connector) => {
            const state = statuses?.find(
              (status) => status.id === connector.id
            )?.state;
            const Icon =
              state === undefined ? CircleDashedIcon : STATE_ICONS[state];
            return (
              <li
                className="flex items-center gap-3 rounded-lg border p-3"
                key={connector.id}
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{connector.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {stateLabel(state, canConnect)}
                  </span>
                </span>
                {state === "connected" ? (
                  <Button
                    disabled={busy !== null}
                    onClick={() => revoke(connector.id)}
                    size="sm"
                    variant="outline"
                  >
                    {busy === connector.id ? "Disconnecting…" : "Disconnect"}
                  </Button>
                ) : null}
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
