import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return null;
  return session.user.id;
}
