import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

type Props = { source: number; enabled: boolean };

function AudioPlayerOnFocus({ source, enabled }: Props) {
  const player = useAudioPlayer(source);

  useEffect(() => {
    // expo-audio players expose mutable native properties.
    // eslint-disable-next-line react-hooks/immutability
    player.loop = true;
    player.volume = 0.45;
  }, [player]);

  useFocusEffect(useCallback(() => {
    if (enabled) player.play();
    return () => player.pause();
  }, [enabled, player]));

  return null;
}

export function FocusedBackgroundAudio(props: Props) {
  // expo-audio's web player creates an HTML Audio element during render.
  if (Platform.OS === 'web' && typeof window === 'undefined') return null;
  return <AudioPlayerOnFocus {...props} />;
}
