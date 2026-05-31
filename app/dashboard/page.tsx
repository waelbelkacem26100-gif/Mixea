import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
    </main>
  );
}
