import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm md:p-12">
        <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          Product Ready Memo App
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          让备忘录成为可协作、可追踪的工作台
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          支持登录、数据持久化、优先级和标签管理，适合团队内部真实使用。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/memos"><Button size="lg">进入工作台</Button></Link>
          <Link href="/login"><Button variant="outline" size="lg">登录 / 注册</Button></Link>
        </div>
      </section>
    </main>
  );
}
