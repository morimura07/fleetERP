import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { Topbar } from "@/components/layout/topbar";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "DRIVER") redirect("/dashboard");

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-screen flex-col">
        <Topbar name={session.user.name ?? ""} role={session.user.role} />
        <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </SessionProvider>
  );
}
