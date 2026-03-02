"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Memo } from "@/types/memo";

interface MemoCardProps {
  memo: Memo;
  onEdit: (memo: Memo) => void;
  onDelete: (memo: Memo) => Promise<void>;
}

function priorityVariant(priority: Memo["priority"]): "success" | "warning" | "danger" {
  if (priority === "high")
    return "danger";
  if (priority === "low")
    return "success";
  return "warning";
}

function priorityLabel(priority: Memo["priority"]) {
  if (priority === "high")
    return "高优先级";
  if (priority === "low")
    return "低优先级";
  return "中优先级";
}

export function MemoCard({ memo, onEdit, onDelete }: MemoCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-2 text-lg">{memo.title}</CardTitle>
          <Badge variant={priorityVariant(memo.priority)}>{priorityLabel(memo.priority)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-5 whitespace-pre-wrap text-sm text-slate-600">{memo.content}</p>
        {memo.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {memo.tags.map(tag => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">
          更新于 {new Date(memo.updatedAt).toLocaleString("zh-CN")}
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(memo)}>
          <Pencil className="mr-1 h-4 w-4" /> 编辑
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(memo)}>
          <Trash2 className="mr-1 h-4 w-4" /> 删除
        </Button>
      </CardFooter>
    </Card>
  );
}
