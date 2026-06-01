// Companion live-preview overlay (Track D Phase 1B).
//
// Renders the selected character as a positioning guide on top of the live
// preview. The picker entry point is owned by the camera's Subject controls.
//
// What it does today:
//   - When a character is set, `<CharacterLayer/>` renders absolutely over
//     the parent, draggable / pinchable / rotatable / double-tap to flip.
//
// What it does NOT do yet:
//   - Bake the character into the captured frame. The CameraStage capture
//     path takes a native photo without the overlay; downstream
//     preview/share will paint the character on top via a separate
//     compositor (Phase 1C — see plan §3.3).

import { StyleSheet, View } from 'react-native';
import { CharacterLayer } from './CharacterLayer';
import { CharacterPickerSheet } from './CharacterPickerSheet';
import type { CharacterEntry } from '../../libs/services/companion/character-library';

export type CompanionOverlayProps = {
  parentSize: { width: number; height: number };
  editMode?: boolean;
  character: CharacterEntry | null;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onSelectCharacter: (entry: CharacterEntry) => void;
};

export function CompanionOverlay({
  parentSize,
  editMode = true,
  character,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onSelectCharacter,
}: CompanionOverlayProps) {
  return (
    <>
      {character ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <CharacterLayer
            cutoutUri={character.cutoutUri}
            intrinsicW={character.intrinsicW}
            intrinsicH={character.intrinsicH}
            parentSize={parentSize}
            editMode={editMode}
            onLongPress={onOpenPicker}
          />
        </View>
      ) : null}

      <CharacterPickerSheet
        visible={pickerOpen}
        selectedId={character?.id ?? null}
        onSelect={(entry) => {
          onSelectCharacter(entry);
          onClosePicker();
        }}
        onClose={onClosePicker}
      />
    </>
  );
}
