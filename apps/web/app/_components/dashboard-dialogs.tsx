"use client";

import dynamic from "next/dynamic";
import { type ReactElement, useState } from "react";
import type { Account } from "./account";
import type { ConnectorSummary } from "./connections-dialog";
import {
  PendingChangesDialog,
  usePendingCount,
} from "./pending-changes-dialog";

// Most visits never open these, so each loads the first time it's opened.
const ConnectionsDialog = dynamic(() =>
  import("./connections-dialog").then((module) => module.ConnectionsDialog)
);
const EditMemberDialog = dynamic(() =>
  import("./edit-member-dialog").then((module) => module.EditMemberDialog)
);
const NewMemberWizard = dynamic(() =>
  import("./new-member-wizard").then((module) => module.NewMemberWizard)
);
const RemoveProjectDialog = dynamic(() =>
  import("./remove-project-dialog").then((module) => module.RemoveProjectDialog)
);
const SettingsDialog = dynamic(() =>
  import("./settings-dialog").then((module) => module.SettingsDialog)
);

/** True from the first time `open` is, so a dialog stays mounted to animate closed. */
function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) {
    setOpened(true);
  }
  return opened;
}

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
 * Connections, a crew member's Edit, the New crew member wizard, and Pending
 * changes.
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
  const [editing, setEditing] = useState<string | null>(null);
  // Kept while the dialog animates closed, so it doesn't reload as nobody.
  const [lastEdited, setLastEdited] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const removeOpened = useOpenedOnce(removeOpen);
  const settingsOpened = useOpenedOnce(settingsOpen);
  const connectionsOpened = useOpenedOnce(connectionsOpen);
  const editOpened = useOpenedOnce(editing !== null);
  const newOpened = useOpenedOnce(newOpen);
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
          openEdit: (memberId: string) => {
            setLastEdited(memberId);
            setEditing(memberId);
          },
          openNewMember: () => setNewOpen(true),
          openPendingChanges: () => setPendingOpen(true),
        }
      : {}),
  };

  const dialogs = (
    <>
      {settingsOpened ? (
        <SettingsDialog
          onEdit={actions.openEdit}
          onOpenChange={setSettingsOpen}
          onPendingChanges={actions.openPendingChanges}
          onRemove={() => setRemoveOpen(true)}
          open={settingsOpen}
          pendingCount={pending.count}
        />
      ) : null}
      {removeOpened ? (
        <RemoveProjectDialog onOpenChange={setRemoveOpen} open={removeOpen} />
      ) : null}
      {hasConnectors && connectionsOpened ? (
        <ConnectionsDialog
          account={account}
          connectors={connectors}
          onOpenChange={setConnectionsOpen}
          open={connectionsOpen}
        />
      ) : null}
      {canChange ? (
        <>
          {editOpened ? (
            <EditMemberDialog
              memberId={editing ?? lastEdited}
              onOpenChange={(next) => !next && setEditing(null)}
              onPullRequest={pending.refresh}
              open={editing !== null}
            />
          ) : null}
          {newOpened ? (
            <NewMemberWizard
              onOpenChange={setNewOpen}
              onPullRequest={pending.refresh}
              open={newOpen}
            />
          ) : null}
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
