"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(2, "昵称至少 2 字"),
  email: z.string().email("请输入正确邮箱"),
  password: z.string().min(8, "密码至少 8 位"),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    setLoading(false);

    if (!response.ok) {
      setError("注册失败，请检查输入信息");
      return;
    }

    router.push("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>创建账号</CardTitle>
          <CardDescription>注册后即可使用完整备忘录功能</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-1">
              <label htmlFor="name" className="text-sm text-slate-700">昵称</label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm text-slate-700">邮箱</label>
              <Input id="email" type="email" {...form.register("email")} />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm text-slate-700">密码</label>
              <Input id="password" type="password" {...form.register("password")} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            已有账号？<Link href="/login" className="text-blue-600 hover:underline">去登录</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
