import { describe, expect, it, mock } from 'bun:test';
import * as React from 'react';
import { findAll, render } from './render-helpers';

mock.module('@react-native-community/slider', () => ({
  default: (props: Record<string, unknown>) => React.createElement('Slider', props),
}));

mock.module('../../../components/themed', () => ({
  readableTextOn: () => '#000',
  ThemedText: (props: { children?: React.ReactNode }) =>
    React.createElement('Text', props, props.children),
}));

const { default: OverlayControlsBar } =
  await import('../../../components/pilgrimage/camera/OverlayControlsBar');

const noop = () => undefined;
type OverlayControlsBarProps = React.ComponentProps<typeof OverlayControlsBar>;

describe('camera overlay controls', () => {
  it('surfaces character selection inside subject controls', () => {
    let pickerOpenCount = 0;
    const props: OverlayControlsBarProps = {
      visible: true,
      mode: 'subject',
      edgeIntensity: 'low',
      subjectCombine: false,
      characterSelected: false,
      opacity: 0.35,
      flipped: false,
      editMode: false,
      themeColor: '#ff9900',
      onSelectOff: noop,
      onSelectMode: noop,
      onSelectEdgeIntensity: noop,
      onToggleSubjectCombine: noop,
      onOpenCharacterPicker: () => {
        pickerOpenCount += 1;
      },
      onChangeOpacity: noop,
      onToggleFlip: noop,
      onToggleEdit: noop,
    };
    const tree = render(OverlayControlsBar, props);

    const buttons = findAll(tree, (node) => node.props.accessibilityLabel === 'Pick character');
    expect(buttons.length).toBeGreaterThan(0);

    (buttons[0].props.onPress as () => void)();

    expect(pickerOpenCount).toBe(1);
  });
});
