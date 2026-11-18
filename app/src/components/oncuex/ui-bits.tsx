import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  dispositionLabel,
  statusLabel,
} from "@/oncuex/format";
import type { RequirementStatus } from "@/oncuex/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "info" | "danger";

const chipTones: Record<Tone, string> = {
  neutral: "border-border/70 bg-muted/60 text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function Chip({
  children,
  tone = "neutral",
  mono = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        chipTones[tone],
        mono && "font-mono tracking-tight",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
  contentClassName,
  id,
}: {
  title?: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-border/70 bg-card text-card-foreground shadow-panel",
        className,
      )}
    >
      {(title || eyebrow || actions) && (
        <header className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {title && <h2 className="text-[15px] font-semibold leading-6">{title}</h2>}
            {description && (
              <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("px-5 py-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: RequirementStatus }) {
  const variant =
    status === "supported"
      ? "success"
      : status === "blocked"
        ? "warning"
        : status === "outdated"
          ? "info"
          : "destructive";
  return (
    <Badge variant={variant} className="gap-1.5 font-semibold">
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "supported" && "bg-success",
          status === "blocked" && "bg-warning",
          status === "outdated" && "bg-info",
          status === "missing" && "bg-destructive",
        )}
      />
      {statusLabel[status]}
    </Badge>
  );
}

export function CurrentnessBadge({ currentness }: { currentness: "current" | "historical" }) {
  return (
    <Badge variant={currentness === "current" ? "success" : "warning"} className="font-semibold">
      {currentness === "current" ? "Current" : "Historical"}
    </Badge>
  );
}

export function DispositionBadge({ disposition }: { disposition: string }) {
  const variant =
    disposition === "accepted" ? "success" : disposition === "rejected" ? "destructive" : "warning";
  return (
    <Badge variant={variant} className="font-semibold">
      {dispositionLabel[disposition] ?? disposition}
    </Badge>
  );
}

export function KeyValue({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-[13px] leading-5", mono && "font-mono text-[12px]")}>{value}</dd>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/30 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn("font-mono text-[11.5px] tracking-tight text-foreground/90", className)}>
      {children}
    </code>
  );
}

export function Note({
  children,
  tone = "neutral",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] leading-5",
        chipTones[tone],
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
