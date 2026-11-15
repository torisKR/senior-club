import { createContext, useContext } from 'react';

/** 마을 게임 화면 안에서는 공용 Card·SeniorButton·Screen이 픽셀 RPG 스킨으로 그려집니다. */
const GameSkinContext = createContext(false);

export const GameSkinProvider = GameSkinContext.Provider;

export function useGameSkin(): boolean {
  return useContext(GameSkinContext);
}
