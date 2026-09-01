import { use } from 'react';

import { AppStateContext } from '@/context/app-state';

export function useAppState() {
  const value = use(AppStateContext);

  if (!value) {
    throw new Error('useAppState는 AppStateProvider 안에서 사용해야 합니다.');
  }

  return value;
}
