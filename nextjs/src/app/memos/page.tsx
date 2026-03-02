import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { MemosClient } from "@/features/memos/components/memos-client";
import { authOptions } from "@/lib/auth";

export default async function MemosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    redirect("/login");

  return <MemosClient />;
}
