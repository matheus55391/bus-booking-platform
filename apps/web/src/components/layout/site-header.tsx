import Link from 'next/link';
import { Bus } from 'lucide-react';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Bus className="size-5" aria-hidden />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight text-foreground">
            Rodoviária
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            href="/pedido"
            className="text-foreground/80 transition-colors hover:text-foreground"
          >
            Consultar pedido
          </Link>
          <p className="hidden text-muted-foreground sm:block">
            Passagens de ônibus pelo Brasil
          </p>
        </nav>
      </div>
    </header>
  );
}
