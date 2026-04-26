import Image from "next/image";
import Link from "next/link";

export const AuthLayout = ({ children }: { children: React.ReactNode; }) => {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6 md:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,207,127,0.2),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(109,187,255,0.2),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(132,85,255,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-amber-200/25 to-transparent blur-2xl" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-amber-100/20 bg-slate-950/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-8">
        <Link href="/" className="flex items-center gap-2 self-center font-medium text-amber-100">
          <Image src="/logos/logo.svg" alt="Nodebase" width={30} height={30} className="drop-shadow-[0_0_8px_rgba(245,207,127,0.5)]" />
          <span className="tracking-[0.12em] uppercase">Nodebase</span>
        </Link>
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-[0.06em] text-amber-50">Welcome to Nodebase</h1>
          <p className="text-sm text-amber-100/80">
            An automation platform powered by Manish.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
};
