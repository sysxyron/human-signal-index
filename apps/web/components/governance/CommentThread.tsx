'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Card, Textarea } from '@hsi/ui';
import { MessagesSquare, Send } from 'lucide-react';
import type { ReviewCommentRecord } from '@hsi/shared-types';
import {
  listCommentsAction,
  addCommentAction,
} from '@/app/dashboard/review/actions';
import { parseMentions, type ReviewEntityType } from '@/lib/governance/view';
import { ErrorCard, SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { CommentItem, type CommentNode } from './CommentItem';

type CommentWithEmail = ReviewCommentRecord & { userEmail?: string };

/** Build the parent_id-threaded tree from a flat comment list. */
function buildTree(comments: CommentWithEmail[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) {
    byId.set(c.id, { ...c, children: [] });
  }
  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => a.created_at.localeCompare(b.created_at));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/**
 * Threaded comment panel for a governed entity. Loads via listCommentsAction on
 * mount, renders the parent_id tree (CommentItem), and posts via addCommentAction
 * with @mention parsing. useTransition; full loading / empty / error / auth
 * states. Following HSI transparency, disagreement in comments is preserved.
 */
export function CommentThread({
  entityType,
  entityId,
  isAuthenticated,
}: {
  entityType: string;
  entityId: string;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const [comments, setComments] = useState<CommentWithEmail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await listCommentsAction(entityType as ReviewEntityType, entityId);
    if (res.ok) {
      setComments(res.data);
    } else {
      setLoadError(res.error);
      setComments([]);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(comments ?? []), [comments]);

  const onPosted = (record: ReviewCommentRecord | null) => {
    setReplyingTo(null);
    if (record) {
      setComments((prev) => [...(prev ?? []), record]);
    } else {
      void load();
    }
  };

  const composer = useCallback(
    (parentId: string | null) => (
      <Composer
        entityType={entityType}
        entityId={entityId}
        parentId={parentId ?? undefined}
        onPosted={onPosted}
        onAuthExpired={() => setAuthExpired(true)}
        compact={parentId !== null}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, entityId],
  );

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-electric" />
          <h3 className="text-h6 font-semibold text-text-primary">Discussion</h3>
        </div>
        <span className="text-caption text-text-muted">
          {comments ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {isAuthenticated ? (
        authExpired ? (
          <SignInPrompt message="Sign in again to comment" redirectedFrom={pathname} />
        ) : (
          composer(null)
        )
      ) : (
        <SignInPrompt message="Sign in to comment" redirectedFrom={pathname} />
      )}

      {loadError ? <ErrorCard message={loadError} title="Could not load comments" /> : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-card border border-border bg-surface-2/40" />
          ))}
        </div>
      ) : tree.length === 0 && !loadError ? (
        <p className="rounded-card border border-border bg-surface-2/40 px-4 py-6 text-center text-caption text-text-muted">
          No comments yet. Start the discussion — @mention reviewers to notify them.
        </p>
      ) : (
        <div className="space-y-2">
          {tree.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              onReply={(id) => setReplyingTo((cur) => (cur === id ? null : id))}
              replyingTo={replyingTo}
              composer={(pid) =>
                isAuthenticated && !authExpired ? (
                  composer(pid)
                ) : (
                  <SignInPrompt message="Sign in to reply" redirectedFrom={pathname} />
                )
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function Composer({
  entityType,
  entityId,
  parentId,
  onPosted,
  onAuthExpired,
  compact = false,
}: {
  entityType: string;
  entityId: string;
  parentId?: string;
  onPosted: (record: ReviewCommentRecord | null) => void;
  onAuthExpired: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mentions = parseMentions(text);

  const submit = () => {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addCommentAction(
        entityType as ReviewEntityType,
        entityId,
        text.trim(),
        parentId,
        mentions.length ? mentions : undefined,
      );
      if (res.ok) {
        setText('');
        onPosted(res.data);
      } else if (res.code === 'AUTH_REQUIRED') {
        onAuthExpired();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      {error ? <ErrorCard message={error} title="Could not post comment" /> : null}
      <Textarea
        rows={compact ? 2 : 3}
        value={text}
        placeholder={compact ? 'Write a reply… use @ to mention' : 'Add a comment… use @ to mention reviewers'}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {mentions.length > 0 ? `Mentioning: ${mentions.map((m) => `@${m}`).join(', ')}` : 'Use @ to notify someone'}
        </span>
        <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
          <Send className="h-3.5 w-3.5" />
          {pending ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  );
}
