export type MemoPriority = "low" | "medium" | "high";

export interface Memo {
  id: string;
  title: string;
  content: string;
  tags: string[];
  priority: MemoPriority;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoRequest {
  title: string;
  content: string;
  tags?: string[];
  priority: MemoPriority;
}

export type UpdateMemoRequest = Partial<CreateMemoRequest>;
