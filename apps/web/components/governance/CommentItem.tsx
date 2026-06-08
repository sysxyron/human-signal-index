'use client';

import { useState } from 'react';
import { CornerDownRight, MessageSquare, AtSign } from 'lucide-react';
import type { ReviewCommentRecord } from '@hsi/shared-types';
import { fmtRelative, segmentComment } from '@/lib/governance/view';

export interface CommentNode extends ReviewCommentRecord {
  userEmail?: string;
  children: CommentNode[];
}

/** Renders one threaded comment + its replies, with highlighted @mentions and a
 *  reply affordance that surfaces an inline reply composer. */
export function CommentItem({
  node,
  depth = 0,
  onReply,
  replyingTo,
  composer,
}: {
  node: CommentNode;
  depth?: number;
  onReply: (id: string) => void;
  replyingTo: string | null;
  composer: (parentId: string) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const segments = segmentComment(node.comment);

  return (
    <div className={depth > 0 ? 'border-l border-border/60 pl-4' : ''}>
      <div className="rounded-card border border-border bg-surface-2/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-caption font-semibold text-text-primary">
            <MessageSquare className="h-3.5 w-3.5 text-electric" />
            {node.userEmail ?? (node.user_id ? node.user_id.slice(0, 8) : 'Unknown')}
          </span>
          <span className="text-[11px] text-text-muted">{fmtRelative(node.created_at)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
          {segments.map((seg, i) =>
            seg.mention ? (
              <span
                key={i}
                className="rounded bg-electric/15 px-1 font-medium text-electric"
              >
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {node.mentions.length > 0 ? (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted">
            <AtSign className="h-3 w-3" />
            {node.mentions.length} mentioned
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => onReply(node.id)}
            className="inline-flex items-center gap-1 font-semibold text-text-muted transition hover:text-electric"
          >
            <CornerDownRight className="h-3 w-3" /> Reply
          </button>
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="font-semibold text-text-muted transition hover:text-text-primary"
            >
              {collapsed ? `Show ${node.children.length} repl${node.children.length === 1 ? 'y' : 'ies'}` : 'Hide replies'}
            </button>
          ) : null}
        </div>
      </div>

      {replyingTo === node.id ? <div className="mt-2">{composer(node.id)}</div> : null}

      {!collapsed && node.children.length > 0 ? (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CommentItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onReply={onReply}
              replyingTo={replyingTo}
              composer={composer}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
