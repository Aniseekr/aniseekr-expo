import { Easing, FadeInDown, FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';

export const sheetEnter = () => FadeInUp.duration(260).easing(Easing.out(Easing.cubic));

export const overlayEnter = () => FadeInUp.duration(220).easing(Easing.out(Easing.cubic));

export const overlayExit = () => FadeOutDown.duration(180);

export const overlayLayout = () => Layout.duration(150);

export const listItemEnter = (index: number, stagger = 40) =>
  FadeInUp.delay(index * stagger)
    .duration(280)
    .easing(Easing.out(Easing.cubic));

export const listItemEnterDown = (index: number, stagger = 40) =>
  FadeInDown.delay(index * stagger)
    .duration(280)
    .easing(Easing.out(Easing.cubic));
