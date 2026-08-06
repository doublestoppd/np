import { Brand } from "@/components/ui/brand";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8"
    >
      <div className="mb-6">
        <Brand href="/sign-in" tagline="A cozy grove of companion creatures." />
      </div>
      {children}
    </main>
  );
}
