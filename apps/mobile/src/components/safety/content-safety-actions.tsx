import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import {
  REPORT_REASONS,
  safetyApi,
  type ReportReason,
} from '@/api/safety-api';
import { getPublicWebPageUrl } from '@/config/public-web-links';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addBlockedUserId } from '@/safety/blocked-users-store';

import { AppText } from '../ui/app-text';
import { SeniorButton } from '../ui/senior-button';
import {
  buildSafetyReportInput,
  safetyReportDuplicateMessage,
  safetyReportSuccessMessage,
  type ContentReportTargetType,
  type SafetyReportKind,
} from './report-request';
import { shouldShowContentSafetyActions } from './safety-visibility';

const REASON_LABELS: Record<ReportReason, string> = {
  SPAM: '광고·도배',
  ABUSE: '욕설·비방',
  HARASSMENT: '괴롭힘',
  MISINFORMATION: '허위 정보',
  INAPPROPRIATE: '부적절한 콘텐츠',
  OTHER: '기타',
};

type OpenPanel = 'content-report' | 'user-report' | 'block' | null;
type PendingAction = Exclude<OpenPanel, null>;

export interface ContentSafetyActionsProps {
  targetType: ContentReportTargetType;
  targetId: string;
  targetLabel: string;
  authorUserId: string;
  authorName: string;
  currentUserId: string | undefined;
  onBlocked?: (blockedUserId: string) => void | Promise<void>;
}

export interface SafetyTermsLinkProps {
  onOpenError?: (message: string) => void;
}

export function SafetyTermsLink({ onOpenError }: SafetyTermsLinkProps) {
  async function openTerms() {
    try {
      await Linking.openURL(getPublicWebPageUrl('terms'));
    } catch {
      onOpenError?.('서비스 이용약관을 열지 못했습니다. 네트워크 연결을 확인해 주세요.');
    }
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="서비스 이용약관 열기"
      onPress={() => void openTerms()}
      style={({ pressed }) => ({
        minHeight: TouchTarget.compact,
        alignSelf: 'flex-start',
        justifyContent: 'center',
        opacity: pressed ? 0.65 : 1,
      })}>
      <AppText variant="caption" color="primary" selectable={false}>
        신고 기준과 서비스 이용약관 보기
      </AppText>
    </Pressable>
  );
}

export function ContentSafetyActions(props: ContentSafetyActionsProps) {
  const { authorUserId, currentUserId, targetId, targetType } = props;
  if (
    !currentUserId ||
    !shouldShowContentSafetyActions(authorUserId, currentUserId)
  ) {
    return null;
  }
  const identityKey = JSON.stringify([
    currentUserId,
    targetType,
    targetId,
    authorUserId,
  ]);
  return (
    <AuthenticatedContentSafetyActions
      key={identityKey}
      {...props}
      currentUserId={currentUserId}
    />
  );
}

function AuthenticatedContentSafetyActions({
  targetType,
  targetId,
  targetLabel,
  authorUserId,
  authorName,
  currentUserId,
  onBlocked,
}: Omit<ContentSafetyActionsProps, 'currentUserId'> & { currentUserId: string }) {
  const theme = useTheme();
  const operationController = useRef<AbortController | null>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [reason, setReason] = useState<ReportReason>();
  const [detail, setDetail] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(
    () => () => {
      operationController.current?.abort();
    },
    [],
  );

  function open(panel: Exclude<OpenPanel, null>) {
    if (pending) return;
    const next = openPanel === panel ? null : panel;
    setOpenPanel(next);
    setReason(undefined);
    setDetail('');
    setError('');
    setNotice('');
  }

  async function submitReport() {
    if (
      (openPanel !== 'content-report' && openPanel !== 'user-report') ||
      !reason ||
      pending
    ) {
      setError(reason ? '' : '신고 이유를 선택해 주세요.');
      return;
    }
    const reportKind: SafetyReportKind =
      openPanel === 'user-report' ? 'user' : 'content';
    const pendingAction = openPanel;
    const normalizedDetail = detail.trim();
    if (normalizedDetail.length === 1) {
      setError('상세 내용은 입력하려면 두 글자 이상 적어 주세요.');
      return;
    }

    const controller = new AbortController();
    operationController.current?.abort();
    operationController.current = controller;
    setPending(pendingAction);
    setError('');
    setNotice('');
    try {
      await safetyApi.report(
        buildSafetyReportInput({
          kind: reportKind,
          contentTargetType: targetType,
          contentTargetId: targetId,
          authorUserId,
          reason,
          ...(normalizedDetail ? { detail: normalizedDetail } : {}),
        }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setNotice(safetyReportSuccessMessage(reportKind, targetLabel, authorName));
      setOpenPanel(null);
      setReason(undefined);
      setDetail('');
    } catch (reportError) {
      if (!controller.signal.aborted) {
        setError(
          reportError instanceof ApiError && reportError.code === 'REPORT_ALREADY_OPEN'
            ? safetyReportDuplicateMessage(reportKind, authorName)
            : apiErrorMessage(
                reportError,
                reportKind === 'user'
                  ? '사용자 신고를 접수하지 못했습니다.'
                  : '콘텐츠 신고를 접수하지 못했습니다.',
              ),
        );
      }
    } finally {
      if (operationController.current === controller) {
        operationController.current = null;
      }
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function submitBlock() {
    if (pending) return;
    const controller = new AbortController();
    operationController.current?.abort();
    operationController.current = controller;
    setPending('block');
    setError('');
    setNotice('');
    try {
      await safetyApi.block({ blockedUserId: authorUserId }, controller.signal);
      if (controller.signal.aborted) return;
      addBlockedUserId(currentUserId, authorUserId);
      setNotice(`${authorName} 님을 차단했습니다.`);
      setOpenPanel(null);
      try {
        await onBlocked?.(authorUserId);
      } catch (refreshError) {
        if (!controller.signal.aborted) {
          setError(
            apiErrorMessage(
              refreshError,
              '차단은 완료됐지만 최신 콘텐츠 목록을 불러오지 못했습니다.',
            ),
          );
        }
      }
    } catch (blockError) {
      if (!controller.signal.aborted) {
        setError(apiErrorMessage(blockError, '사용자를 차단하지 못했습니다.'));
      }
    } finally {
      if (operationController.current === controller) {
        operationController.current = null;
      }
      if (!controller.signal.aborted) setPending(null);
    }
  }

  return (
    <View style={{ gap: Spacing.md, paddingTop: Spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <SeniorButton
          label="콘텐츠 신고"
          variant="outline"
          fullWidth={false}
          disabled={Boolean(pending)}
          onPress={() => open('content-report')}
          accessibilityHint={`이 ${targetLabel} 콘텐츠를 운영진에게 신고하는 양식을 엽니다`}
          style={{ flexGrow: 1, flexBasis: 180 }}
        />
        <SeniorButton
          label="사용자 신고"
          variant="outline"
          fullWidth={false}
          disabled={Boolean(pending)}
          onPress={() => open('user-report')}
          accessibilityHint={`${authorName} 님을 운영진에게 신고하는 양식을 엽니다`}
          style={{ flexGrow: 1, flexBasis: 180 }}
        />
        <SeniorButton
          label="사용자 차단"
          variant="danger"
          fullWidth={false}
          disabled={Boolean(pending)}
          onPress={() => open('block')}
          accessibilityHint={`${authorName} 님의 콘텐츠를 숨기는 확인 영역을 엽니다`}
          style={{ flexGrow: 1, flexBasis: 180 }}
        />
      </View>

      {openPanel === 'content-report' || openPanel === 'user-report' ? (
        <View
          accessibilityLabel={
            openPanel === 'user-report' ? '사용자 신고 양식' : '콘텐츠 신고 양식'
          }
          style={{
            padding: Spacing.lg,
            gap: Spacing.lg,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: Radius.lg,
            borderCurve: 'continuous',
            backgroundColor: theme.backgroundElement,
          }}>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="sectionTitle">
              {openPanel === 'user-report' ? '사용자 신고' : '콘텐츠 신고'}
            </AppText>
            <AppText color="textSecondary">
              {openPanel === 'user-report'
                ? `${authorName} 님의 계정 또는 반복되는 행동을 운영진에게 알립니다. 콘텐츠 신고와 사용자 차단은 자동으로 처리되지 않습니다.`
                : `이 ${targetLabel} 자체를 운영진에게 알립니다. 사용자 신고와 사용자 차단은 자동으로 처리되지 않습니다.`}
            </AppText>
          </View>
          <View accessibilityRole="radiogroup" style={{ gap: Spacing.sm }}>
            {REPORT_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: Boolean(pending) }}
                  disabled={Boolean(pending)}
                  onPress={() => {
                    setReason(value);
                    setError('');
                  }}
                  style={({ pressed }) => ({
                    minHeight: TouchTarget.minimum,
                    paddingHorizontal: Spacing.lg,
                    paddingVertical: Spacing.md,
                    justifyContent: 'center',
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.primary : theme.border,
                    borderRadius: Radius.md,
                    borderCurve: 'continuous',
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : pressed
                        ? theme.surface
                        : theme.backgroundElement,
                  })}>
                  <AppText
                    variant="bodyStrong"
                    color={selected ? 'primary' : 'text'}
                    selectable={false}>
                    {REASON_LABELS[value]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md }}>
              <AppText variant="bodyStrong">상세 내용 (선택)</AppText>
              <AppText variant="caption" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
                {detail.length}/1000
              </AppText>
            </View>
            <TextInput
              accessibilityLabel="선택 입력인 신고 상세 내용"
              accessibilityHint="입력하려면 두 글자 이상, 최대 천 자까지 작성하세요"
              allowFontScaling
              editable={!pending}
              maxLength={1_000}
              multiline
              onChangeText={(value) => {
                setDetail(value);
                setError('');
              }}
              placeholder="운영진이 확인할 수 있도록 상황을 설명해 주세요."
              placeholderTextColor={theme.textMuted}
              textAlignVertical="top"
              value={detail}
              style={{
                minHeight: 112,
                padding: Spacing.lg,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: Radius.md,
                borderCurve: 'continuous',
                color: theme.text,
                backgroundColor: theme.surface,
                fontSize: 18,
                lineHeight: 28,
              }}
            />
          </View>
          <SeniorButton
            label={
              openPanel === 'user-report'
                ? '사용자 신고 보내기'
                : '콘텐츠 신고 보내기'
            }
            loading={pending === openPanel}
            disabled={!reason || Boolean(pending)}
            onPress={() => void submitReport()}
          />
        </View>
      ) : null}

      {openPanel === 'block' ? (
        <View
          accessibilityLabel="사용자 차단 확인"
          style={{
            padding: Spacing.lg,
            gap: Spacing.lg,
            borderWidth: 1,
            borderColor: theme.danger,
            borderRadius: Radius.lg,
            borderCurve: 'continuous',
            backgroundColor: theme.dangerSurface,
          }}>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="sectionTitle" color="danger">사용자 차단</AppText>
            <AppText color="textSecondary">
              {authorName} 님의 콘텐츠를 이 계정에서 숨깁니다. 콘텐츠 신고와 사용자 신고는 자동으로 접수되지 않습니다.
            </AppText>
          </View>
          <SeniorButton
            label={`${authorName} 님 차단하기`}
            variant="danger"
            loading={pending === 'block'}
            disabled={Boolean(pending)}
            onPress={() => void submitBlock()}
          />
        </View>
      ) : null}

      <SafetyTermsLink onOpenError={setError} />

      {notice ? (
        <AppText accessibilityLiveRegion="polite" variant="bodyStrong" color="success">
          {notice}
        </AppText>
      ) : null}
      {error ? (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          variant="bodyStrong"
          color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
