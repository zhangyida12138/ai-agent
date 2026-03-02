import { z } from "zod";

export const memoPrioritySchema = z.enum(["low", "medium", "high"]);

export const createMemoSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题最多 120 字"),
  content: z.string().trim().min(1, "内容不能为空").max(5000, "内容最多 5000 字"),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).optional().default([]),
  priority: memoPrioritySchema.default("medium"),
});

export const updateMemoSchema = createMemoSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: "至少需要一个更新字段" },
);

export type CreateMemoInput = z.infer<typeof createMemoSchema>;
export type UpdateMemoInput = z.infer<typeof updateMemoSchema>;
