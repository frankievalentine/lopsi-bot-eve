import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";

const DEPLOYMENTS =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fdeployments&title=Go+to+Deployments";

/**
 * This deployment was built before this address was added to the project, so
 * sign-in doesn't trust it yet.
 */
export function UnknownAddress() {
  return (
    <main
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center"
      id="main"
    >
      <Mascot kind="lookout" mood="idle" size={88} />
      <div className="max-w-sm space-y-1">
        <h1 className="text-lg font-semibold">This Address Isn't Ready Yet</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign-in only trusts addresses the project had when it was deployed.
          Redeploy the project to add this one.
        </p>
      </div>
      <Button
        render={<a href={DEPLOYMENTS} rel="noreferrer" target="_blank" />}
      >
        Open Deployments
      </Button>
    </main>
  );
}
