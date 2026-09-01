import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  COMMENT_CONTENT_MAX_LENGTH,
  COMMENT_CONTENT_MIN_LENGTH,
  isAmbiguousCreateFailure,
  postsApi,
  type CommunityComment,
} from '@/api/posts-api';
import { AppText, Card, SeniorButton } from '@/components/ui';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import { buildLoginHref, buildOnboardingHref } from '@/utils/auth-routing';

interface CommentComposerProps {
  postId: string;
  returnTo: string;
  onCreated: (comment: CommunityComment) => void;
  onVerifyAmbiguousResult: () => void;
}

export function CommentComposer({
  postId,
  returnTo,
  onCreated,
  onVerifyAmbiguousResult,
}: CommentComposerProps) {
  const router = useRouter();
  const theme = useTheme();
  const { isHydrated, onboardingCompleted, session } = useAppState();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [ambiguous, setAmbiguous] = useState(false);
  const inFlight = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const submit = async () => {
    if (inFlight.current || ambiguous || !session || !onboardingCompleted) return;
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
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const comment = await postsApi.createComment(
        postId,
        { content: normalized },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setContent('');
      setNotice('댓글을 등록했습니다.');
      onCreated(comment);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) {
        router.push(buildLoginHref(returnTo));
        return;
      }
      if (caught instanceof ApiError && caught.code === 'ONBOARDING_REQUIRED') {
        router.push(buildOnboardingHref(returnTo));
        return;
      }
      if (isAmbiguousCreateFailure(caught)) {
        setAmbiguous(true);
        setError(
          '등록 결과를 확인하지 못했어요. 중복 댓글을 막기 위해 댓글 목록을 먼저 확인해 주세요.',
        );
      } else {
        setError(apiErrorMessage(caught, '댓글을 등록하지 못했습니다.'));
      }
    } finally {
      if (requestController.current === controller) requestController.current = null;
      inFlight.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <Card style={{ gap: Spacing.lg }}>
      <View style={{ gap: Spacing.xs }}>
        <AppText variant="sectionTitle">댓글 쓰기</AppText>
        <AppText variant="body" color="textSecondary">
          서로를 배려하는 말로 이야기를 이어가 주세요.
        </AppText>
      </View>

      {!isHydrated ? (
        <View
          style={styles.statusRow}
          accessibilityRole="progressbar"
          accessibilityLabel="댓글 작성 권한을 확인하는 중"
        >
          <ActivityIndicator color={theme.primary} />
          <AppText variant="bodyStrong">작성 권한을 확인하고 있어요</AppText>
        </View>
      ) : !session ? (
        <SeniorButton
          label="로그인하고 댓글 쓰기"
          onPress={() => router.push(buildLoginHref(returnTo))}
        />
      ) : !onboardingCompleted ? (
        <SeniorButton
          label="시작 설정 마치고 댓글 쓰기"
          onPress={() => router.push(buildOnboardingHref(returnTo))}
        />
      ) : (
        <>
          <TextInput
            value={content}
            onChangeText={(value) => {
              setContent(value);
              setNotice('');
              if (!ambiguous) setError('');
            }}
            editable={!submitting && !ambiguous}
            maxLength={COMMENT_CONTENT_MAX_LENGTH}
            multiline
            placeholder="댓글 내용을 입력해 주세요."
            placeholderTextColor={theme.textMuted}
            textAlignVertical="top"
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            accessibilityLabel="댓글 내용"
          />
          <AppText variant="caption" color="textSecondary" align="right">
            {content.length} / {COMMENT_CONTENT_MAX_LENGTH}자
          </AppText>

          {notice ? (
            <AppText color="success" accessibilityRole="alert">
              {notice}
            </AppText>
          ) : null}
          {error ? (
            <View
              style={[
                styles.message,
                {
                  backgroundColor: ambiguous ? theme.warningSurface : theme.dangerSurface,
                  borderColor: ambiguous ? theme.warning : theme.danger,
                },
              ]}
              accessibilityRole="alert"
            >
              <AppText color={ambiguous ? 'warning' : 'danger'}>{error}</AppText>
            </View>
          ) : null}

          {ambiguous ? (
            <View style={{ gap: Spacing.sm }}>
              <SeniorButton
                label="댓글 목록에서 등록 여부 확인"
                onPress={onVerifyAmbiguousResult}
              />
              <SeniorButton
                label="확인했으며 다시 등록 준비"
                variant="outline"
                onPress={() => {
                  setAmbiguous(false);
                  setError('');
                }}
              />
            </View>
          ) : (
            <SeniorButton label="댓글 등록하기" loading={submitting} onPress={submit} />
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    minHeight: TouchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  input: {
    minHeight: 132,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 18,
    lineHeight: 27,
  },
  message: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
});
