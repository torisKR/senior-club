import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText, Card, SectionHeader, SeniorButton } from '@/components/ui';
import { AppIcon } from '@/components/ui/app-icon';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MOBILE_HIKING_COURSES,
  MOBILE_HOBBY_RECOMMENDATIONS,
  type MobileHikingCourse,
  type MobileHobbyRecommendation,
} from '@/data/senior-recommendations';

export function SeniorHobbyCourseSection() {
  const router = useRouter();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'courses' | 'hobbies'>('courses');

  return (
    <View style={{ gap: Spacing.lg }}>
      <SectionHeader
        title="등산 코스 & 활력 취미생활"
        description="5060 맞춤 추천: 관절에 무리 없는 완만한 둘레길과 따뜻한 이웃 활동을 추천해 드려요."
      />

      {/* Tab Switcher - 56px touch target */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.lg,
          padding: Spacing.xs,
          gap: Spacing.xs,
        }}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'courses' }}
          accessibilityLabel="완만한 등산 코스 탭"
          onPress={() => setActiveTab('courses')}
          style={{
            flex: 1,
            minHeight: TouchTarget.minimum,
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: Spacing.sm,
            padding: Spacing.sm,
            borderRadius: Radius.md,
            backgroundColor: activeTab === 'courses' ? theme.primary : 'transparent',
          }}
        >
          <AppIcon name="activity" color={activeTab === 'courses' ? theme.inverseText : theme.text} size={20} />
          <AppText
            variant="bodyStrong"
            selectable={false}
            style={{ color: activeTab === 'courses' ? theme.inverseText : theme.text, flexShrink: 1, textAlign: 'center' }}
          >
            완만 등산코스
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'hobbies' }}
          accessibilityLabel="추천 취미생활 탭"
          onPress={() => setActiveTab('hobbies')}
          style={{
            flex: 1,
            minHeight: TouchTarget.minimum,
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: Spacing.sm,
            padding: Spacing.sm,
            borderRadius: Radius.md,
            backgroundColor: activeTab === 'hobbies' ? theme.primary : 'transparent',
          }}
        >
          <AppIcon name="explore" color={activeTab === 'hobbies' ? theme.inverseText : theme.text} size={20} />
          <AppText
            variant="bodyStrong"
            selectable={false}
            style={{ color: activeTab === 'hobbies' ? theme.inverseText : theme.text, flexShrink: 1, textAlign: 'center' }}
          >
            추천 취미생활
          </AppText>
        </Pressable>
      </View>

      {activeTab === 'courses' ? (
        <View style={{ gap: Spacing.md }}>
          {MOBILE_HIKING_COURSES.map((course: MobileHikingCourse) => (
            <Card key={course.id} style={{ gap: Spacing.md, backgroundColor: theme.surface }}>
              <View style={{ gap: Spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View
                    style={{
                      backgroundColor: theme.backgroundSelected,
                      paddingHorizontal: Spacing.sm,
                      paddingVertical: Spacing.xs,
                      borderRadius: Radius.sm,
                    }}
                  >
                    <AppText variant="caption" color="primary">
                      {course.difficultyLabel}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="textMuted">
                    {course.location}
                  </AppText>
                </View>

                <AppText variant="sectionTitle">
                  {course.title}
                </AppText>
                <AppText variant="body" color="textSecondary">
                  {course.tagline}
                </AppText>
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.divider,
                  paddingTop: Spacing.sm,
                  gap: Spacing.xs,
                }}
              >
                <AppText variant="caption" color="text">
                  소요 시간: {course.duration} ({course.length})
                </AppText>
                {course.features.map((feat, idx) => (
                  <AppText key={idx} variant="caption" color="textMuted">
                    • {feat}
                  </AppText>
                ))}
              </View>

              <SeniorButton
                label="함께 걷는 모임 보기"
                variant="secondary"
                onPress={() => {
                  if (course.recommendedEventId) {
                    router.push({ pathname: '/event/[id]', params: { id: course.recommendedEventId } });
                  } else {
                    router.push('/events');
                  }
                }}
              />
            </Card>
          ))}
        </View>
      ) : (
        <View style={{ gap: Spacing.md }}>
          {MOBILE_HOBBY_RECOMMENDATIONS.map((hobby: MobileHobbyRecommendation) => (
            <Card key={hobby.id} style={{ gap: Spacing.md, backgroundColor: theme.surface }}>
              <View style={{ gap: Spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <AppText variant="display">{hobby.emoji}</AppText>
                  <View
                    style={{
                      backgroundColor: theme.backgroundElement,
                      paddingHorizontal: Spacing.sm,
                      paddingVertical: Spacing.xs,
                      borderRadius: Radius.sm,
                    }}
                  >
                    <AppText variant="caption" color="primary">
                      {hobby.category}
                    </AppText>
                  </View>
                </View>

                <AppText variant="sectionTitle">
                  {hobby.name}
                </AppText>
                <AppText variant="body" color="textSecondary">
                  {hobby.tagline}
                </AppText>
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.divider,
                  paddingTop: Spacing.sm,
                  gap: Spacing.xs,
                }}
              >
                <AppText variant="caption" color="primary">
                  이런 점이 좋아요
                </AppText>
                {hobby.benefits.map((b, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
                    <AppIcon name="check" color={theme.primary} size={18} />
                    <AppText variant="caption" color="text" style={{ flex: 1, minWidth: 0 }}>{b}</AppText>
                  </View>
                ))}
              </View>

              <SeniorButton
                label={hobby.actionText}
                variant="primary"
                onPress={() => {
                  router.push('/events');
                }}
              />
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}
