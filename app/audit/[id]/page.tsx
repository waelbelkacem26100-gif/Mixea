import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AuditPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <h1 className="text-2xl font-bold text-white">Audit {id}</h1>
    </main>
  );
}
