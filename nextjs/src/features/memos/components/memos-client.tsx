"use client";

import { Plus } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemoCard } from "@/features/memos/components/memo-card";
import { MemoForm } from "@/features/memos/components/memo-form";
import type { CreateMemoRequest, Memo } from "@/types/memo";

export function MemosClient() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);

  async function fetchMemos() {
    const response = await fetch("/api/memos", { cache: "no-store" });
    if (!response.ok)
      throw new Error("加载备忘录失败");
    const data = (await response.json()) as Memo[];
    setMemos(data);
  }

  useEffect(() => {
    fetchMemos()
      .catch(() => toast.error("加载备忘录失败"))
      .finally(() => setLoading(false));
  }, []);

  async function createMemo(data: CreateMemoRequest) {
    const response = await fetch("/api/memos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok)
      throw new Error("创建失败");
    await fetchMemos();
    setShowForm(false);
    toast.success("创建成功");
  }

  async function updateMemo(data: CreateMemoRequest) {
    if (!editingMemo)
      return;

    const response = await fetch(`/api/memos/${editingMemo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok)
      throw new Error("更新失败");

    await fetchMemos();
    setEditingMemo(null);
    setShowForm(false);
    toast.success("更新成功");
  }

  async function deleteMemo(memo: Memo) {
    const ok = window.confirm(`确认删除「${memo.title}」吗？`);
    if (!ok)
      return;

    const response = await fetch(`/api/memos/${memo.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("删除失败");
      return;
    }

    setMemos(prev => prev.filter(item => item.id !== memo.id));
    toast.success("删除成功");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">我的备忘录</h1>
          <p className="mt-1 text-sm text-slate-500">可搜索、可编辑、可追踪优先级</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingMemo(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> 新建备忘录
          </Button>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            退出登录
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingMemo ? "编辑备忘录" : "新建备忘录"}</CardTitle>
          </CardHeader>
          <CardContent>
            <MemoForm
              initialValue={editingMemo}
              onSubmit={editingMemo ? updateMemo : createMemo}
              onCancel={() => {
                setShowForm(false);
                setEditingMemo(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {loading
        ? (
            <p className="py-20 text-center text-slate-500">加载中...</p>
          )
        : memos.length === 0
          ? (
              <Card>
                <CardContent className="py-16 text-center text-slate-500">还没有备忘录，点击右上角开始创建。</CardContent>
              </Card>
            )
          : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {memos.map(memo => (
                  <MemoCard key={memo.id} memo={memo} onEdit={(item) => {
                    setEditingMemo(item);
                    setShowForm(true);
                  }} onDelete={deleteMemo} />
                ))}
              </div>
            )}
    </div>
  );
}
