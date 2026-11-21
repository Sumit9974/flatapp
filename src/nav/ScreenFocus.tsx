import { createContext, useContext } from 'react';

/**
 * True while a screen is the one on top. Screens lower in the stack stay mounted (hidden) so Back
 * keeps their state; this tells them when they are showing again, so their data is refreshed
 * (for example the recurring list after adding one). Screens outside the stack count as on top.
 */
export const ScreenFocus = createContext(true);

export function useScreenFocused(): boolean {
  return useContext(ScreenFocus);
}
