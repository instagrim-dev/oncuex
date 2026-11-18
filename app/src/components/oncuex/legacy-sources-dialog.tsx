import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/oncuex/format";
import { sourceAttribution } from "@/oncuex/scenario";
import type { EvidenceRecord, Requirement } from "@/oncuex/types";

interface LegacySourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: EvidenceRecord[];
  requirements: Requirement[];
  onOpenCheck: (requirementId: string) => void;
}

export function LegacySourcesDialog({ open, onOpenChange, records, requirements, onOpenCheck }: LegacySourcesDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Review affected sources</DialogTitle><DialogDescription>These earlier fictional records remain in your saved history. Their excerpts do not support the associated checks, so they need corrected sources.</DialogDescription></DialogHeader><div className="space-y-3">{records.map((record) => <article key={record.id} className="rounded-lg border border-warning/30 bg-warning/5 p-4"><p className="text-xs font-semibold">{requirements.find((item) => item.id === record.requirementId)?.label ?? record.requirementId}</p><p className="mt-1 text-[11px] text-muted-foreground">{sourceAttribution(record)} · {record.id} · valid to {formatDate(record.expiresAt)}</p><blockquote className="mt-2 border-l-2 border-warning/40 pl-3 text-sm leading-6">“{record.sourceExcerpt}”</blockquote><p className="mt-2 text-xs text-muted-foreground">This original is preserved, but it is not usable support for this check.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => onOpenCheck(record.requirementId)}>Open affected check</Button></article>)}</div></DialogContent></Dialog>;
}
