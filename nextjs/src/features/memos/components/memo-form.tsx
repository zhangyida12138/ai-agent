"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Memo } from "@/types/memo";

const formSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题最多 120 字"),
  content: z.string().trim().min(1, "内容不能为空").max(5000, "内容最多 5000 字"),
  priority: z.enum(["low", "medium", "high"]),
  tagsText: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface MemoFormProps {
  initialValue?: Memo | null;
  onSubmit: (payload: {
    title: string;
    content: string;
    priority: "low" | "medium" | "high";
    tags: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

export function MemoForm({ initialValue, onSubmit, onCancel }: MemoFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const defaultValues = useMemo<FormValues>(() => ({
    title: initialValue?.title ?? "",
    content: initialValue?.content ?? "",
    priority: initialValue?.priority ?? "medium",
    tagsText: (initialValue?.tags ?? []).join(", "),
  }), [initialValue]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  async function handleSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const tags = (values.tagsText ?? "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);
      await onSubmit({
        title: values.title,
        content: values.content,
        priority: values.priority,
        tags,
      });
      form.reset(defaultValues);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="title">标题</label>
        <Input id="title" placeholder="比如：周会纪要" {...form.register("title")} />
        {form.formState.errors.title && (
          <p className="text-xs text-red-600">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="content">内容</label>
        <Textarea id="content" rows={6} placeholder="输入备忘录内容..." {...form.register("content")} />
        {form.formState.errors.content && (
          <p className="text-xs text-red-600">{form.formState.errors.content.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="priority">优先级</label>
        <select
          id="priority"
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          {...form.register("priority")}
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="tagsText">标签（逗号分隔）</label>
        <Input id="tagsText" placeholder="工作, 会议, 灵感" {...form.register("tagsText")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>{submitting ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
