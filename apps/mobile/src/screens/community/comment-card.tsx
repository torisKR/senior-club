import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  COMMENT_CONTENT_MAX_LENGTH,
  COMMENT_CONTENT_MIN_LENGTH,
  postsApi,
  type CommunityComment,
} from '@/api/posts-api';
import { ContentSafetyActions } from '@/components/safety';
import { AppText, Card, SeniorButton } from '@/components/ui';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildLoginHref } from '@/utils/auth-routing';

import { formatCommunityDate } from './post-card';

interface CommentCardProps {
  comment: CommunityComment;
  currentUserId?: string;
  returnTo: string;
  onUpdated: (comment: CommunityComment) => void;
  onDeleted: (commentId: string) => void;
  onAuthorBlocked: (authorUserId: string) => void | Promise<void>;
}

export function CommentCard({
  comment,
  currentUserId,
  returnTo,
  onUpdated,
  onDeleted,
  onAuthorBlocked,
}: CommentCardProps) {
  const router = useRouter();
  const theme = useTheme();
  const isAuthor = currentUserId !== undefined && currentUserId === comment.author.id;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [busy, setBusy] = useState<'update' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const update = async () => {
    if (!isAuthor || inFlight.current) return;
    const normalized = content.trim();
    if (
      normalized.length < COMMENT_CONTENT_MIN_LENGTH ||
      normalized.length > COMMENT_CONTENT_MAX_LENGTH
    ) {
      setError('댓글은 2자 이상 1000자 이하로 입력해 주세요.');
      return;
    }
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    inFlight.current = true;
    setBusy('update');
    setError('');
    try {
      const updated = await postsApi.updateComment(
        comment.postId,
        comment.id,
        normalized,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      onUpdated(updated);
      setEditing(false);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) {
        router.push(buildLoginHref(returnTo));
        return;
      }
      setError(apiErrorMessage(caught, '댓글을 수정하지 못했습니다. 새로고침 후 확인해 주세요.'));
    } finally {
      if (requestController.current === controller) requestController.current = null;
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(null);
    }
  };

  const confirmDelete = () => {
    if (!isAuthor || inFlight.current) return;
    Alert.alert('댓글을 삭제할까요?', '삭제한 댓글은 게시판에서 더 이상 보이지 않습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (inFlight.current) return;
          const controller = new AbortController();
          requestController.current?.abort();
          requestController.current = controller;
          inFlight.current = true;
          setBusy('delete');
          setError('');
          try {
            await postsApi.deleteComment(comment.id, controller.signal);
            if (!controller.signal.aborted) onDeleted(comment.id);
          } catch (caught) {
            if (controller.signal.aborted) return;
            if (caught instanceof ApiError && caught.status === 401) {
              router.push(buildLoginHref(returnTo));
              return;
            }
            setError(
              apiErrorMessage(caught, '댓글을 삭제하지 못했습니다. 새로고침 후 확인해 주세요.'),
            );
          } finally {
            if (requestController.current === controller) requestController.current = null;
            inFlight.current = false;
            if (!controller.signal.aborted) setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={comment.parentId ? styles.replyIndent : undefined}>
      <Card style={{ gap: Spacing.md }}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="bodyStrong">{comment.author.name}</AppText>
            <AppText variant="caption" color="textSecondary">
              {formatCommunityDate(comment.createdAt)}
              {comment.updatedAt !== comment.createdAt ? ' · 수정됨' : ''}
            </AppText>
          </View>
          {comment.parentId ? (
            <View style={[styles.replyBadge, { backgroundColor: theme.infoSurface }]}>
              <AppText variant="caption" color="info" selectable={false}>
                답글
              </AppText>
            </View>
          ) : null}
        </View>

        {editing ? (
          <View style={{ gap: Spacing.sm }}>
            <TextInput
              value={content}
              onChangeText={(value) => {
                setContent(value);
                setError('');
              }}
              editable={!busy}
              maxLength={COMMENT_CONTENT_MAX_LENGTH}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              accessibilityLabel="수정할 댓글 내용"
            />
            <AppText variant="caption" color="textSecondary" align="right">
              {content.length} / {COMMENT_CONTENT_MAX_LENGTH}자
            </AppText>
            <View style={styles.actionRow}>
              <SeniorButton
                label="수정 취소"
                variant="outline"
                fullWidth={false}
                disabled={Boolean(busy)}
                onPress={() => {
                  setContent(comment.content);
                  setEditing(false);
                  setError('');
                }}
              />
              <SeniorButton
                label="수정 저장"
                fullWidth={false}
                loading={busy === 'update'}
                disabled={busy === 'delete'}
                onPress={update}
              />
            </View>
          </View>
        ) : (
          <AppText variant="body">{comment.content}</AppText>
        )}

        {error ? (
          <AppText color="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        {isAuthor && !editing ? (
          <View style={styles.ownerActions} accessibilityLabel="내 댓글 관리">
            <Pressable
              onPress={() => {
                setContent(comment.content);
                setEditing(true);
                setError('');
              }}
              disabled={Boolean(busy)}
              accessibilityRole="button"
              accessibilityLabel="댓글 수정"
              style={styles.textAction}
            >
              <AppText variant="bodyStrong" color="primary" selectable={false}>
                수정
              </AppText>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              disabled={Boolean(busy)}
              accessibilityRole="button"
              accessibilityLabel="댓글 삭제"
              style={styles.textAction}
            >
              <AppText variant="bodyStrong" color="danger" selectable={false}>
                {busy === 'delete' ? '삭제 중' : '삭제'}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {currentUserId && !isAuthor && !editing ? (
          <ContentSafetyActions
            targetType="COMMENT"
            targetId={comment.id}
            targetLabel="댓글"
            authorUserId={comment.author.id}
            authorName={comment.author.name}
            currentUserId={currentUserId}
            onBlocked={onAuthorBlocked}
          />
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  replyIndent: { marginLeft: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  replyBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  input: {
    minHeight: 120,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 18,
    lineHeight: 27,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.sm },
  ownerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  textAction: {
    minWidth: TouchTarget.compact,
    minHeight: TouchTarget.compact,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
