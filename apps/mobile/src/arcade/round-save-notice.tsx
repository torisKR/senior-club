import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, SeniorButton } from '@/components/ui';
import { MemoryRpgStorage, type RpgKeyValueStorage } from '@/rpg/rpg-storage';
import { saveRound, type RoundLoad, type RoundSaveStatus } from './round-save';

export function useRoundSave<T>(storage: RpgKeyValueStorage, key: string, loaded: RoundLoad<T>, round: T) {
  const serialized = JSON.stringify(round);
  const previous = useRef(serialized);
  const protectedSave = loaded.status === 'protected';
  const [status, setStatus] = useState<RoundSaveStatus>(
    protectedSave ? 'protected' : storage instanceof MemoryRpgStorage ? 'volatile' : 'ready',
  );

  const retry = useCallback(() => {
    if (!protectedSave) setStatus(saveRound(storage, key, JSON.parse(serialized) as T));
  }, [storage, key, protectedSave, serialized]);

  useEffect(() => {
    if (previous.current === serialized) return;
    previous.current = serialized;
    retry();
  }, [serialized, retry]);

  return { status, retry };
}

export function RoundSaveNotice({ status, onRetry }: { status: RoundSaveStatus; onRetry: () => void }) {
  if (status === 'ready' || status === 'saved') return null;
  const message = status === 'protected'
    ? '기존 라운드 기록을 읽을 수 없어 덮어쓰지 않았습니다. 현재 진행은 저장되지 않습니다.'
    : status === 'volatile'
      ? '기기 저장소를 사용할 수 없어 현재 진행은 앱을 종료하면 사라질 수 있습니다.'
      : '라운드를 저장하지 못했습니다. 현재 진행이 앱 종료 후 남지 않을 수 있습니다.';
  return (
    <View style={styles.warning} accessibilityLiveRegion="polite" testID="round-save-warning">
      <AppText variant="bodyStrong" style={styles.text}>{message}</AppText>
      {status === 'failed' ? <SeniorButton label="다시 저장" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  warning: { padding: 12, gap: 8, borderWidth: 2, borderColor: '#9A3412', borderRadius: 10, backgroundColor: '#FFF1C7' },
  text: { color: '#762E10' },
});
