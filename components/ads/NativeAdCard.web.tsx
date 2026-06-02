import { useImperativeHandle, type Ref } from 'react';

export interface NativeAdCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

interface Props {
  isTop?: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  activeTranslation?: unknown;
  ref?: Ref<NativeAdCardRef>;
}

export function NativeAdCard({ onSwipe, ref }: Props) {
  useImperativeHandle(
    ref,
    () => ({
      swipe: onSwipe,
    }),
    [onSwipe]
  );

  return null;
}
