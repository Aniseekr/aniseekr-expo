// Theme-tile binding for the pilgrimage maps. The map screens call
// resolveTileStyle(effectiveMode) on first paint and on every theme change,
// then push the result into the WebView via __setTileStyle. If this picker
// drifts (e.g. someone swaps voyager for positron without thinking about it),
// every map renders with the wrong palette — pin this down here.

import { describe, expect, it } from 'bun:test';
import {
  TILE_STYLES,
  buildMapThemeVars,
  resolveTileStyle,
} from '../../../libs/services/pilgrimage/leaflet-map';

describe('resolveTileStyle', () => {
  it('returns voyager for light mode', () => {
    expect(resolveTileStyle('light')).toBe('voyager');
  });

  it('returns darkMatter for dark mode', () => {
    expect(resolveTileStyle('dark')).toBe('darkMatter');
  });

  it('points at known TILE_STYLES entries', () => {
    expect(TILE_STYLES[resolveTileStyle('light')]).toBeDefined();
    expect(TILE_STYLES[resolveTileStyle('dark')]).toBeDefined();
  });
});

describe('buildMapThemeVars', () => {
  it('uses the tile body bg for --map-bg so loading does not flash a different shade', () => {
    const vars = buildMapThemeVars({
      effectiveMode: 'dark',
      accent: '#FF9F0A',
      tileStyle: 'darkMatter',
    });
    expect(vars['--map-bg']).toBe(TILE_STYLES.darkMatter.bodyBg);
  });

  it('lifts dark tiles via --tile-filter so CARTO Dark Matter does not feel black', () => {
    const vars = buildMapThemeVars({
      effectiveMode: 'dark',
      accent: '#FF9F0A',
      tileStyle: 'darkMatter',
    });
    expect(vars['--tile-filter']).toContain('brightness');
    expect(vars['--tile-filter']).not.toBe('none');
  });

  it('skips the tile filter in light mode', () => {
    const vars = buildMapThemeVars({
      effectiveMode: 'light',
      accent: '#FF9F0A',
      tileStyle: 'voyager',
    });
    expect(vars['--tile-filter']).toBe('none');
  });

  it('threads theme.accent into the spinner so a theme change repaints the loader', () => {
    const vars = buildMapThemeVars({
      effectiveMode: 'dark',
      accent: '#A78BFA',
      tileStyle: 'darkMatter',
    });
    expect(vars['--map-spinner']).toBe('#A78BFA');
  });

  it('flips chrome tonal scale between light and dark', () => {
    const dark = buildMapThemeVars({
      effectiveMode: 'dark',
      accent: '#FF9F0A',
      tileStyle: 'darkMatter',
    });
    const light = buildMapThemeVars({
      effectiveMode: 'light',
      accent: '#FF9F0A',
      tileStyle: 'voyager',
    });
    // Dark mode FAB is lighter than its press state (Material 3 elevation
    // tonal scale), but FAB is darker than light mode's white FAB.
    expect(dark['--map-chrome']).not.toBe(light['--map-chrome']);
    expect(light['--map-chrome'].toLowerCase()).toBe('#ffffff');
  });
});
