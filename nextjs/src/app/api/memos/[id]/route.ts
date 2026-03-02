import { NextRequest, NextResponse } from "next/server";
import {
  deleteMemoForUser,
  getMemoByIdForUser,
  updateMemoForUser,
} from "@/features/memos/server/memo-service";
import { requireUserId } from "@/lib/server-session";
import { updateMemoSchema } from "@/lib/validations/memo";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    if (!userId)
      return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { id } = await params;
    const memo = await getMemoByIdForUser(userId, id);

    if (!memo) {
      return NextResponse.json({ error: "备忘录不存在" }, { status: 404 });
    }

    return NextResponse.json(memo);
  } catch {
    return NextResponse.json({ error: "获取备忘录失败" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    if (!userId)
      return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const parsed = updateMemoSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const updatedMemo = await updateMemoForUser(userId, id, parsed.data);

    if (!updatedMemo) {
      return NextResponse.json({ error: "备忘录不存在" }, { status: 404 });
    }

    return NextResponse.json(updatedMemo);
  } catch {
    return NextResponse.json({ error: "更新备忘录失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    if (!userId)
      return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { id } = await params;
    const deleted = await deleteMemoForUser(userId, id);

    if (!deleted) {
      return NextResponse.json({ error: "备忘录不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "删除成功" });
  } catch {
    return NextResponse.json({ error: "删除备忘录失败" }, { status: 500 });
  }
}
