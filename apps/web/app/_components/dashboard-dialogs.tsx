"use client";

import { type ReactElement, useState } from "react";
import type { Account } from "./account";
import { ConnectionsDialog, type ConnectorSummary } from "./connections-dialog";
import { MemberConfigDialog } from "./member-config-dialog";
import {
  PendingChangesDialog,
  usePendingCount,
} from "./pending-changes-dialog";
import { SettingsDialog } from "./settings-dialog";

type MemberDialogMode =
  | { readonly kind: "edit"; readonly memberId: string }
  | { readonly kind: "new" };

/** What opens the dashboard's dialogs; absent where a dialog isn't available. */
export interface DashboardDialogActions {
  readonly openConnections?: () => void;
  readonly openEdit?: (memberId: string) => void;
  readonly openNewMember?: () => void;
  readonly openPendingChanges?: () => void;
  readonly openSettings: () => void;
  /** Open pull requests from the dashboard, for the Pending changes badge. */
  readonly pendingCount: number | null;
}

/**
 * The dashboard's dialogs, one of each, and what opens them: Settings,
 * Connections, a crew member's Edit or a new one, and Pending changes.
 * Settings opens the others through the same actions.
 */
export function useDashboardDialogs({
  account,
  changes,
  connectors,
}: {
  readonly account: Account;
  readonly changes?: { readonly available: boolean } | undefined;
  readonly connectors: readonly ConnectorSummary[];
}): { actions: DashboardDialogActions; dialogs: ReactElement } {
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [memberDialog, setMemberDialog] = useState<MemberDialogMode | null>(
    null
  );
  const [pendingOpen, setPendingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canChange = changes?.available === true;
  const pending = usePendingCount(canChange);
  const hasConnectors = connectors.length > 0;

  const actions: DashboardDialogActions = {
    openSettings: () => setSettingsOpen(true),
    pendingCount: pending.count,
    ...(hasConnectors
      ? { openConnections: () => setConnectionsOpen(true) }
      : {}),
    ...(canChange
      ? {
          openEdit: (memberId: string) =>
            setMemberDialog({ kind: "edit", memberId }),
          openNewMember: () => setMemberDialog({ kind: "new" }),
          openPendingChanges: () => setPendingOpen(true),
        }
      : {}),
  };

  const dialogs = (
    <>
      <SettingsDialog
        onConnections={actions.openConnections}
        onEdit={actions.openEdit}
        onOpenChange={setSettingsOpen}
        onPendingChanges={actions.openPendingChanges}
        open={settingsOpen}
        pendingCount={pending.count}
      />
      {hasConnectors ? (
        <ConnectionsDialog
          account={account}
          connectors={connectors}
          onOpenChange={setConnectionsOpen}
          open={connectionsOpen}
        />
      ) : null}
      {canChange ? (
        <>
          <MemberConfigDialog
            mode={memberDialog ?? { kind: "new" }}
            onOpenChange={(next) => !next && setMemberDialog(null)}
            onPullRequest={pending.refresh}
            open={memberDialog !== null}
          />
          <PendingChangesDialog
            onOpenChange={(next) => {
              setPendingOpen(next);
              if (!next) {
                pending.refresh();
              }
            }}
            open={pendingOpen}
          />
        </>
      ) : null}
    </>
  );

  return { actions, dialogs };
}
