import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — Dokes Fitness" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold mb-1">Dokes Fitness</h1>
        <p className="text-sm text-zinc-400 mb-8">Sign in to continue.</p>
        <LoginForm searchParamsPromise={searchParams} />
      </div>
    </main>
  );
}
