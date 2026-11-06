/**
 * 게임 사운드 매니저 — SFX 원샷 재생.
 * 모든 재생은 `enabled`(아케이드 `state.soundEnabled`) 게이트를 통하며,
 * 어떤 실패도 게임플레이를 중단시키지 않는다.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

export type SfxId =
  | 'putt'        // 파크골프 타구 "딱!"
  | 'holein'      // 홀컵 골인 "달그락-통!"
  | 'stoneClack'  // 알까기 바둑알 "따닥!"
  | 'tileMatch'   // 사천성 패 맞춤 "착-딱!"
  | 'combo'       // 사천성 가야금 상승음계
  | 'chime';      // 승급 풍경(추수)

const SOURCES: Record<SfxId, number> = {
  putt: require('../../assets/audio/sfx_parkgolf_putt_hit_01.wav'),
  holein: require('../../assets/audio/sfx_parkgolf_holein_01.wav'),
  stoneClack: require('../../assets/audio/sfx_alkkagi_stone_clack_01.wav'),
  tileMatch: require('../../assets/audio/sfx_sacheonseong_tile_match_01.wav'),
  combo: require('../../assets/audio/sfx_sacheonseong_combo_01.wav'),
  chime: require('../../assets/audio/sfx_rank_promotion_chime_01.wav'),
};

const cache: Partial<Record<SfxId, AudioPlayer>> = {};

function getPlayer(id: SfxId): AudioPlayer {
  const cached = cache[id];
  if (cached) return cached;
  const player = createAudioPlayer(SOURCES[id]);
  cache[id] = player;
  return player;
}

async function replayFromStart(id: SfxId): Promise<void> {
  const player = getPlayer(id);
  try {
    if (player.playing) {
      player.pause();
    }
    await player.seekTo(0);
    player.play();
  } catch {
    // 오디오 실패는 무시 — 게임 진행을 막지 않는다.
  }
}

/** SFX 원샷 재생. `enabled`가 false면 아무 소리도 내지 않는다. */
export function playSfx(id: SfxId, enabled = true): void {
  if (!enabled) return;
  void replayFromStart(id);
}
