import { getBond, type NpcBond, type NpcId } from './bond-logic';

export interface BondEpisode {
  id: string;
  npcId: NpcId;
  threshold: 50 | 140;
  title: string;
  dialogue: string;
  choices: readonly { id: string; label: string; response: string }[];
}

export const BOND_EPISODES: readonly BondEpisode[] = [
  { id: 'chief_50', npcId: 'chief', threshold: 50, title: '빈 명단 한 칸', dialogue: '김 이장: "새 회원 명단에 아직 빈칸이 많구먼. 어디부터 손볼까?"', choices: [
    { id: 'invite', label: '이웃에게 초대장을 쓰기', response: '김 이장: "좋지, 한 사람씩 이름을 불러보세."' },
    { id: 'prepare', label: '회관에 자리를 마련하기', response: '김 이장: "올 사람의 자리를 먼저 내어두는구먼."' },
  ] },
  { id: 'chief_140', npcId: 'chief', threshold: 140, title: '다음 이장의 열쇠', dialogue: '김 이장: "언젠가 내가 쉬면 누가 회관 문을 열어줄까?"', choices: [
    { id: 'together', label: '함께 문을 여는 약속하기', response: '김 이장: "그럼 열쇠는 우리 둘이 지키세."' },
    { id: 'share', label: '새 회원에게 열쇠를 알려주기', response: '김 이장: "다음 사람에게 길을 알려주는 게 좋겠네."' },
  ] },
  { id: 'golf_captain_50', npcId: 'golf_captain', threshold: 50, title: '감나무 퍼터의 흠집', dialogue: '박 캡틴: "이 흠집은 첫 라운드 때 생겼어요. 어떻게 보이세요?"', choices: [
    { id: 'memory', label: '기억이 담긴 흠집이라고 말하기', response: '박 캡틴: "그날 바람까지 다시 생각나네요."' },
    { id: 'care', label: '함께 퍼터를 닦아주기', response: '박 캡틴: "손질을 잘하면 오래 같이 걸을 수 있겠어요."' },
  ] },
  { id: 'golf_captain_140', npcId: 'golf_captain', threshold: 140, title: '함께 쓰는 퍼터', dialogue: '박 캡틴: "이 퍼터를 이제 누구에게 맡기면 좋을까요?"', choices: [
    { id: 'share', label: '새 회원과 함께 쓰자고 하기', response: '박 캡틴: "좋습니다. 첫 홀에서 차례로 잡아봐요."' },
    { id: 'practice', label: '캡틴과 한 홀 더 연습하기', response: '박 캡틴: "물려주기 전에 저도 한 번 더 쳐야겠네요."' },
  ] },
  { id: 'baduk_master_50', npcId: 'baduk_master', threshold: 50, title: '반상의 빈 자리', dialogue: '최 사범: "예전 제자는 언제나 저 자리에 앉았소. 자네는 어디에 앉겠소?"', choices: [
    { id: 'opposite', label: '사범 맞은편에 앉기', response: '최 사범: "좋소. 오늘은 우리 둘의 수를 두어봅시다."' },
    { id: 'beside', label: '사범 옆에 나란히 앉기', response: '최 사범: "옆에서 보는 반상도 새롭구려."' },
  ] },
  { id: 'baduk_master_140', npcId: 'baduk_master', threshold: 140, title: '마지막 제자와의 약속', dialogue: '최 사범: "그 아이와 다음 사람에게 예를 전하자 약속했소."', choices: [
    { id: 'teach', label: '함께 새 회원을 맞이하기', response: '최 사범: "인사부터 함께 가르칩시다."' },
    { id: 'listen', label: '제자의 이야기를 더 듣기', response: '최 사범: "그 아이는 늘 돌을 먼저 닦았지."' },
  ] },
  { id: 'tea_manager_50', npcId: 'tea_manager', threshold: 50, title: '두 손으로 받는 찻잔', dialogue: '이 다도명인: "손목이 쉬는 동안 차를 어떻게 내면 좋을까요?"', choices: [
    { id: 'pour', label: '주전자를 대신 들어주기', response: '이 다도명인: "덕분에 저는 찻잔을 천천히 놓을게요."' },
    { id: 'rest', label: '함께 앉아 차가 식기를 기다리기', response: '이 다도명인: "이렇게 쉬어가니 향이 더 잘 느껴져요."' },
  ] },
  { id: 'tea_manager_140', npcId: 'tea_manager', threshold: 140, title: '다실의 빈 찻잔', dialogue: '이 다도명인: "빈 찻잔 하나를 남겨둘까요?"', choices: [
    { id: 'guest', label: '처음 오는 손님을 위해 남기기', response: '이 다도명인: "처음 오는 분도 편히 앉으시겠네요."' },
    { id: 'neighbor', label: '쉬고 있는 이웃을 초대하기', response: '이 다도명인: "차가 식기 전에 같이 모셔와요."' },
  ] },
  { id: 'herbalist_50', npcId: 'herbalist', threshold: 50, title: '작은 아침 약속', dialogue: '강 원장: "하루를 시작하는 습관 하나만 고른다면 무엇이 좋겠소?"', choices: [
    { id: 'walk', label: '잠깐 바깥을 걷기', response: '강 원장: "좋소. 무리하지 말고 천천히 걸읍시다."' },
    { id: 'stretch', label: '함께 기지개 켜기', response: '강 원장: "어깨부터 가볍게 풀어보지요."' },
  ] },
  { id: 'herbalist_140', npcId: 'herbalist', threshold: 140, title: '이어지는 아침', dialogue: '강 원장: "내가 없는 아침에도 체조를 함께할 사람이 있으면 좋겠소."', choices: [
    { id: 'lead', label: '이웃과 함께 체조하기', response: '강 원장: "한 사람이 시작하면 이웃도 따라오겠지요."' },
    { id: 'remind', label: '회관에 아침 약속을 적어두기', response: '강 원장: "누구나 보고 자기 속도로 참여할 수 있겠소."' },
  ] },
];

/** Ending lines describe friendship; they never grant a CP rank. */
export const BOND_ENDING_LINES: Record<NpcId, string> = {
  chief: '김 이장: "자네 덕에 회관 문을 함께 열 사람이 생겼구먼."',
  golf_captain: '박 캡틴: "다음 첫 홀에도 이 퍼터를 함께 잡아봐요."',
  baduk_master: '최 사범: "자네와 나눈 인사를 다음 사람에게도 전하겠소."',
  tea_manager: '이 다도명인: "빈 찻잔은 늘 준비해둘게요. 함께 앉아요."',
  herbalist: '강 원장: "내일 아침도 이웃과 천천히 시작합시다."',
};

export function chooseBondEpisode(bonds: NpcBond[], npcId: NpcId, episodeId: string, choiceId: string): NpcBond[] {
  const episode = BOND_EPISODES.find((item) => item.id === episodeId && item.npcId === npcId);
  const bond = getBond(bonds, npcId);
  if (!episode || bond.points < episode.threshold || bond.scenesSeen.includes(episode.id) ||
      !episode.choices.some((choice) => choice.id === choiceId)) return bonds;
  return bonds.map((item) => item.npcId === npcId ? {
    ...item,
    scenesSeen: [...item.scenesSeen, episode.id],
    sceneChoices: { ...item.sceneChoices, [episode.id]: choiceId },
  } : item);
}
