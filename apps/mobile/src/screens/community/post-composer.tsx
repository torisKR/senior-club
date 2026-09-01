import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  POST_CONTENT_MAX_LENGTH,
  POST_CONTENT_MIN_LENGTH,
  POST_TITLE_MAX_LENGTH,
  POST_TITLE_MIN_LENGTH,
  isAmbiguousCreateFailure,
  postsApi,
  type CommunityPostDetail,
} from '@/api/posts-api';
import { AppText, Card, SeniorButton } from '@/components/ui';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import { buildLoginHref, buildOnboardingHref } from '@/utils/auth-routing';

interface PostComposerProps {
  clubSlug: string;
  returnTo: string;
  onCreated: (post: CommunityPostDetail) => void;
  onVerifyAmbiguousResult: () => void;
}

export function PostComposer({
  clubSlug,
  returnTo,
  onCreated,
  onVerifyAmbiguousResult,
}: PostComposerProps) {
  const router = useRouter();
  const theme = useTheme();
  const { isHydrated, onboardingCompleted, session } = useAppState();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
    const normalizedTitle = title.trim().replace(/\s+/g, ' ');
    const normalizedContent = content.trim();
    if (
      normalizedTitle.length < POST_TITLE_MIN_LENGTH ||
      normalizedTitle.length > POST_TITLE_MAX_LENGTH
    ) {
      setError('제목은 2자 이상 100자 이하로 입력해 주세요.');
      return;
    }
    if (
      normalizedContent.length < POST_CONTENT_MIN_LENGTH ||
      normalizedContent.length > POST_CONTENT_MAX_LENGTH
    ) {
      setError('본문은 10자 이상 5000자 이하로 입력해 주세요.');
      return;
    }

    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      const post = await postsApi.createPost(
        clubSlug,
        { title: normalizedTitle, content: normalizedContent },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setTitle('');
      setContent('');
      setIsOpen(false);
      onCreated(post);
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
          '등록 결과를 확인하지 못했어요. 중복 글을 막기 위해 목록에서 등록 여부를 먼저 확인해 주세요.',
        );
      } else {
        setError(apiErrorMessage(caught, '게시글을 등록하지 못했습니다.'));
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
        <AppText variant="sectionTitle">새 이야기 나누기</AppText>
        <AppText variant="body" color="textSecondary">
          로그인하고 시작 설정을 마친 회원은 글을 작성할 수 있어요.
        </AppText>
      </View>

      {!isHydrated ? (
        <View
          style={styles.statusRow}
          accessibilityRole="progressbar"
          accessibilityLabel="작성 권한을 확인하는 중"
        >
          <ActivityIndicator color={theme.primary} />
          <AppText variant="bodyStrong">작성 권한을 확인하고 있어요</AppText>
        </View>
      ) : !session ? (
        <SeniorButton
          label="로그인하고 글쓰기"
          onPress={() => router.push(buildLoginHref(returnTo))}
        />
      ) : !onboardingCompleted ? (
        <SeniorButton
          label="시작 설정 마치고 글쓰기"
          onPress={() => router.push(buildOnboardingHref(returnTo))}
        />
      ) : (
        <>
          <SeniorButton
            label={isOpen ? '작성창 닫기' : '새 글 쓰기'}
            variant={isOpen ? 'outline' : 'primary'}
            disabled={submitting}
            onPress={() => {
              setIsOpen((current) => !current);
              setError('');
            }}
          />

          {isOpen ? (
            <View style={{ gap: Spacing.lg }}>
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="bodyStrong">제목</AppText>
                <TextInput
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    if (!ambiguous) setError('');
                  }}
                  editable={!submitting && !ambiguous}
                  maxLength={POST_TITLE_MAX_LENGTH}
                  placeholder="예: 다음 산책 코스를 추천해 주세요"
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="next"
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  accessibilityLabel="게시글 제목"
                />
                <AppText variant="caption" color="textSecondary" align="right">
                  {title.length} / {POST_TITLE_MAX_LENGTH}자
                </AppText>
              </View>

              <View style={{ gap: Spacing.sm }}>
                <AppText variant="bodyStrong">본문</AppText>
                <TextInput
                  value={content}
                  onChangeText={(value) => {
                    setContent(value);
                    if (!ambiguous) setError('');
                  }}
                  editable={!submitting && !ambiguous}
                  maxLength={POST_CONTENT_MAX_LENGTH}
                  multiline
                  placeholder="서로에게 도움이 되는 질문이나 경험을 적어주세요."
                  placeholderTextColor={theme.textMuted}
                  textAlignVertical="top"
                  style={[
                    styles.input,
                    styles.contentInput,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  accessibilityLabel="게시글 본문"
                />
                <AppText variant="caption" color="textSecondary" align="right">
                  {content.length} / {POST_CONTENT_MAX_LENGTH}자
                </AppText>
              </View>

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
                    label="목록에서 등록 여부 확인"
                    onPress={() => {
                      setIsOpen(false);
                      onVerifyAmbiguousResult();
                    }}
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
                <SeniorButton label="게시글 등록하기" loading={submitting} onPress={submit} />
              )}
            </View>
          ) : null}
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
    minHeight: TouchTarget.minimum,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 18,
    lineHeight: 27,
  },
  contentInput: { minHeight: 180 },
  message: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
});
