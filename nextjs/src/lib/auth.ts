import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { Priority } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";

const signInSchema = z.object({
  email: z.string().email("请输入合法邮箱"),
  password: z.string().min(8, "密码至少 8 位"),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success)
          return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user?.passwordHash)
          return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid)
          return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      await ensureStarterMemo(user);
    },
  },
};

async function ensureStarterMemo(user: { id: string }) {
  const hasAny = await db.memo.count({ where: { userId: user.id } });
  if (hasAny > 0)
    return;

  await db.memo.create({
    data: {
      userId: user.id,
      title: "欢迎使用备忘录",
      content: "这是你的第一条备忘录。你可以编辑、打标签和设置优先级。",
      priority: Priority.MEDIUM,
      tags: ["欢迎", "指南"],
    },
  });
}
