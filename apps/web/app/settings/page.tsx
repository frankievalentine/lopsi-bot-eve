import { headers } from "next/headers";
import { dashboardFeatures, pageAccess } from "@/app/_components/page-access";
import { accessMode } from "@/lib/access";
import { memberSetup } from "@/lib/agent-info";
import { connectorCatalog } from "@/lib/connectors";
import { CREW } from "@/lib/crew.generated";
import { emailSetup } from "@/lib/email";
import { configChangesUnavailable, targetRepository } from "@/lib/github";
import { isProductionMode } from "@/lib/production-mode";
import { sessionBudgetUsd } from "@/lib/session-budget";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings · Lopsi Bot" };

/** This request's origin, so the server can call the deployed agents. */
async function originOf(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const protocol =
    list.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * Settings: how this deployment is set up, and each crew member's effective
 * setup, read-only. Changes go through the dialogs the dashboard already has
 * (Connections, Pending changes, a crew member's Edit).
 */
export default async function SettingsPage() {
  const access = await pageAccess("/settings");
  if ("page" in access) {
    return access.page;
  }
  const { account } = access;
  const origin = await originOf();
  const setups = await Promise.all(
    CREW.map(
      async (member) =>
        [member.id, await memberSetup(origin, member.id)] as const
    )
  );
  const repository = targetRepository();
  return (
    <SettingsView
      account={account}
      crew={CREW}
      features={dashboardFeatures(account)}
      setups={Object.fromEntries(setups)}
      status={{
        access: accessMode(),
        budgetUsd: sessionBudgetUsd(),
        catalog: connectorCatalog(),
        email: Object.fromEntries(
          CREW.flatMap((member) => {
            const address = emailSetup(member.id)?.address;
            return address ? [[member.id, address]] : [];
          })
        ),
        emailSenders: (process.env.LOPSI_EMAIL_SENDERS ?? "")
          .split(",")
          .filter((entry) => entry.trim()).length,
        github: configChangesUnavailable() === undefined,
        history: isProductionMode(),
        local: account.kind === "open",
        ...(repository === undefined
          ? {}
          : {
              repository: `${repository.owner}/${repository.repo}@${repository.branch}`,
            }),
      }}
    />
  );
}
