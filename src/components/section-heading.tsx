import type { ReactNode } from "react";

export function SectionHeading({
  title,
  description,
  action,
  id,
  level = 2,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
  /** 1 pour le titre principal de la page, 2 pour une section. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Heading
          id={id}
          className={level === 1 ? "text-2xl font-semibold" : "text-xl font-semibold"}
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
