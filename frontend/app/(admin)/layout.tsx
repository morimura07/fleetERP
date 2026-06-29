import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { Sidebar } from "@frontend/components/layout/sidebar";
import { Topbar } from "@frontend/components/layout/topbar";
import { TokenSync } from "@frontend/components/layout/token-sync";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "DRIVER") redirect("/driver");

  return (
    <SessionProvider session={session}>
      <TokenSync />
      <div className="flex min-h-screen">
        <Sidebar role={session.user.role} />
        <div className="flex flex-1 flex-col">
          <Topbar name={session.user.name ?? ""} role={session.user.role} />
          <main className="scroll-slim flex-1 overflow-x-hidden p-5 md:p-8">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
