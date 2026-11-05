import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not Found · Lopsi Bot" };

export default function NotFound() {
  return (
    <main
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center"
      id="main"
    >
      <Mascot kind="lookout" mood="idle" size={88} />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Page Not Found</h1>
        <p className="text-muted-foreground text-sm">
          There's nothing here. Check the link, or go back to your crew.
        </p>
      </div>
      <Button render={<Link href="/" />}>Back to Crew</Button>
    </main>
  );
}
