export interface ClubPostSummary {
  id: string;
  title: string;
  meta: string;
}

export interface ClubPhotoSummary {
  id: string;
  caption: string;
  imageUri?: string;
}

interface ClubContentSummary {
  posts: ClubPostSummary[];
  photos: ClubPhotoSummary[];
}

export const clubContent: Record<string, ClubContentSummary> = {
  'club-garden': {
    posts: [
      { id: 'garden-post-1', title: '장마철 화분 물주기, 이렇게 해보세요', meta: '박정원 리더 · 댓글 8개' },
      { id: 'garden-post-2', title: '우리 집 바질이 새잎을 냈어요', meta: '김현정 · 사진 3장' },
    ],
    photos: [
      {
        id: 'garden-photo-1',
        caption: '지난 모임에서 함께 만든 작은 정원',
      },
      { id: 'garden-photo-2', caption: '회원들이 나눈 여름 허브' },
    ],
  },
  'club-classic': {
    posts: [
      { id: 'classic-post-1', title: '모차르트 공연 전에 알면 좋은 이야기', meta: '이선율 리더 · 댓글 5개' },
      { id: 'classic-post-2', title: '다시 듣고 싶은 영화 속 클래식', meta: '김현정 · 댓글 11개' },
    ],
    photos: [
      {
        id: 'classic-photo-1',
        caption: '해설과 함께한 작은 음악회',
      },
      { id: 'classic-photo-2', caption: '공연 뒤 편안한 차담 시간' },
    ],
  },
  'club-hiking': {
    posts: [
      { id: 'hiking-post-1', title: '여름 둘레길 준비물 안내', meta: '최한길 리더 · 필독' },
      { id: 'hiking-post-2', title: '천천히 걸어서 더 좋았던 숲길', meta: '이순희 · 댓글 6개' },
    ],
    photos: [
      { id: 'hiking-photo-1', caption: '서로의 속도에 맞춰 걷는 길' },
      { id: 'hiking-photo-2', caption: '쉬어 가며 나눈 따뜻한 간식' },
    ],
  },
};

export function getClubContent(clubId: string, imageUri?: string): ClubContentSummary {
  return (
    clubContent[clubId] ?? {
      posts: [
        { id: `${clubId}-post-1`, title: '새로 오신 분들을 환영합니다', meta: '리더 공지 · 필독' },
        { id: `${clubId}-post-2`, title: '다음 활동에서 만나고 싶어요', meta: '회원 이야기 · 댓글 3개' },
      ],
      photos: [
        { id: `${clubId}-photo-1`, caption: '함께해서 더 즐거웠던 순간', imageUri },
        { id: `${clubId}-photo-2`, caption: '천천히 알아가는 우리 모임' },
      ],
    }
  );
}
