import type { ReactNode } from "react";

export function Bezel({
  title,
  stamp,
  children,
  className = "",
}: {
  title: string;
  stamp?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bezel ${className}`}>
      <header className="bezel-title">
        <h2 className="label m-0">{title}</h2>
        {stamp ? <span className="num text-[length:var(--text-xs)] text-[var(--color-ink-2)]">{stamp}</span> : null}
      </header>
      <div className="p-[var(--space-sm)]">{children}</div>
    </section>
  );
}
