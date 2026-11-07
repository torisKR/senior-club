import React, { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, SeniorButton } from '@/components/ui';
import { STORY_CHAPTERS, type StoryChapter } from '@/rpg/story-data';
import { ChangeConfirmation } from './change-confirmation';

export function getStoryTrial(chapterId: string | undefined, type: StoryChapter['climaxTrial']['type']) {
  return STORY_CHAPTERS.find((chapter) => chapter.id === chapterId && chapter.climaxTrial.type === type);
}

export function StoryTrialNotice({ chapter, onLeave, onAbandon, canAbandon }: {
  chapter: StoryChapter;
  onLeave?: () => void;
  onAbandon: () => void;
  canAbandon: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <AppText variant="bodyStrong">이야기 도전 · {chapter.climaxTrial.opponentName}</AppText>
      <AppText variant="body">{chapter.climaxTrial.description}</AppText>
      <AppText variant="caption">일반 대국은 따로 저장됩니다. 도전을 그만두면 이번 시도는 완료하지 못한 것으로 기록합니다.</AppText>
      {confirming ? (
        <ChangeConfirmation
          message="이번 이야기 도전을 그만두고 새 시도를 시작할까요? 완료하지 못한 시도로 기록됩니다."
          cancelLabel="도전 계속하기"
          confirmLabel="시도 그만두기"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onAbandon(); }}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {canAbandon ? <SeniorButton label="이번 시도 그만두기" variant="secondary" onPress={() => setConfirming(true)} /> : null}
          {onLeave ? <SeniorButton label="일반 대국으로 돌아가기" variant="secondary" onPress={onLeave} /> : null}
        </View>
      )}
    </Card>
  );
}
