export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8"
    >
      <div className="mb-6 text-center">
        <span aria-hidden="true" className="text-4xl">
          🌿
        </span>
        <h1 className="mt-2 font-display text-2xl font-bold text-text">
          Glimmergrove
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          A cozy grove of companion creatures.
        </p>
      </div>
      {children}
    </main>
  );
}
