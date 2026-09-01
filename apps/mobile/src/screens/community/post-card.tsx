import { View } from 'react-native';

import type { CommunityPost } from '@/api/posts-api';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const POST_TYPE_LABEL: Record<CommunityPost['type'], string> = {
  GENERAL: '이야기',
  NOTICE: '공지',
  PHOTO: '사진 이야기',
};

export function formatCommunityDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

export function PostCard({ post, onPress }: { post: CommunityPost; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${post.title}, ${post.author.name} 작성, 댓글 ${post.commentCount}개, 게시글 읽기`}
      style={{ gap: Spacing.md }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View
          style={{
            borderRadius: Radius.pill,
            backgroundColor: post.type === 'NOTICE' ? theme.warningSurface : theme.infoSurface,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xs,
          }}
        >
          <AppText
            variant="caption"
            color={post.type === 'NOTICE' ? 'warning' : 'info'}
            selectable={false}
          >
            {POST_TYPE_LABEL[post.type]}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {post.author.name} · {formatCommunityDate(post.createdAt)}
        </AppText>
      </View>

      <AppText variant="sectionTitle">{post.title}</AppText>
      <AppText variant="body" color="textSecondary" numberOfLines={3}>
        {post.content}
      </AppText>
      <AppText variant="caption" color="primary">
        댓글 {post.commentCount.toLocaleString('ko-KR')}개 · 게시글 읽기
      </AppText>
    </Card>
  );
}
