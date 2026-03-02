import { NextRequest, NextResponse } from "next/server";
import { createMemoSchema } from "@/lib/validations/memo";
import { createMemoForUser, listMemosByUser } from "@/features/memos/server/memo-service";
import { requireUserId } from "@/lib/server-session";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId)
      return NextResponse.json({ error: "未登录" }, { status: 401 });

    const memos = await listMemosByUser(userId);
    return NextResponse.json(memos);
  } catch {
    return NextResponse.json({ error: "获取备忘录失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId)
      return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await request.json();
    const parsed = createMemoSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const newMemo = await createMemoForUser(userId, parsed.data);
    return NextResponse.json(newMemo, { status: 201 });
  } catch {
    return NextResponse.json({ error: "创建备忘录失败" }, { status: 500 });
  }
}
