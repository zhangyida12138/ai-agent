import { Priority } from "@prisma/client";
import { db } from "@/lib/db";
import type { Memo } from "@/types/memo";
import type { CreateMemoInput, UpdateMemoInput } from "@/lib/validations/memo";

function toDomainPriority(priority: Priority): Memo["priority"] {
  if (priority === Priority.HIGH)
    return "high";
  if (priority === Priority.LOW)
    return "low";
  return "medium";
}

function toPrismaPriority(priority: Memo["priority"]): Priority {
  if (priority === "high")
    return Priority.HIGH;
  if (priority === "low")
    return Priority.LOW;
  return Priority.MEDIUM;
}

function toMemoDTO(record: {
  id: string;
  title: string;
  content: string;
  tags: string[];
  priority: Priority;
  createdAt: Date;
  updatedAt: Date;
}): Memo {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    tags: record.tags,
    priority: toDomainPriority(record.priority),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listMemosByUser(userId: string): Promise<Memo[]> {
  const records = await db.memo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return records.map(toMemoDTO);
}

export async function getMemoByIdForUser(userId: string, id: string): Promise<Memo | null> {
  const record = await db.memo.findFirst({
    where: { id, userId },
  });
  return record ? toMemoDTO(record) : null;
}

export async function createMemoForUser(userId: string, input: CreateMemoInput): Promise<Memo> {
  const record = await db.memo.create({
    data: {
      userId,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      priority: toPrismaPriority(input.priority),
    },
  });
  return toMemoDTO(record);
}

export async function updateMemoForUser(
  userId: string,
  id: string,
  input: UpdateMemoInput,
): Promise<Memo | null> {
  const exists = await db.memo.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists)
    return null;

  const record = await db.memo.update({
    where: { id },
    data: {
      title: input.title,
      content: input.content,
      tags: input.tags,
      priority: input.priority ? toPrismaPriority(input.priority) : undefined,
    },
  });
  return toMemoDTO(record);
}

export async function deleteMemoForUser(userId: string, id: string): Promise<boolean> {
  const result = await db.memo.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}
