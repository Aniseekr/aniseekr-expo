// Smoke tests for the MapLibre marker views. No native render is possible, so we
// inspect the React element tree (via render-helpers) to pin that each kind shows
// the right badge/photo/star and the cluster/user-puck switch on count/heading.
import { describe, expect, it } from 'bun:test';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
import { NativeMapMarker } from '../../../components/pilgrimage/map/engines/markers/NativeMapMarker';
import { ClusterBubble } from '../../../components/pilgrimage/map/engines/markers/ClusterBubble';
import { UserPuck } from '../../../components/pilgrimage/map/engines/markers/UserPuck';
import { findAll, getAllText, render } from './render-helpers';

const marker = (over: Partial<MapMarker>): MapMarker => ({
  id: 'x',
  lat: 35,
  lng: 135,
  kind: 'spot',
  title: 't',
  color: '#33AACC',
  ...over,
});

describe('NativeMapMarker', () => {
  it('anime balloon shows the cover photo + points badge', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({
        kind: 'anime',
        color: '#FF5577',
        image: 'https://img/c.jpg',
        pointsLength: 12,
      }),
    });
    expect(findAll(tree, (n) => n.type === 'Image').length).toBe(1);
    expect(getAllText(tree)).toContain('12');
  });

  it('spot bubble shows the EP badge', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({ kind: 'spot', episode: 2, markerMode: 'bubble', visited: true }),
    });
    expect(getAllText(tree)).toContain('EP 2');
  });

  it('spot dot shows neither photo nor badge', () => {
    const tree = render(NativeMapMarker, { marker: marker({ kind: 'spot', markerMode: 'dot' }) });
    expect(findAll(tree, (n) => n.type === 'Image').length).toBe(0);
    expect(getAllText(tree)).toEqual([]);
  });

  it('Tourism-88 pin shows the star + #id', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({ id: '88:7', kind: 'city88', color: '#D4AF37', eightyEightId: 7 }),
    });
    const text = getAllText(tree);
    expect(text).toContain('★');
    expect(text).toContain('#7');
  });
});

describe('ClusterBubble', () => {
  it('shows the count when zoomed in (numbered bubble)', () => {
    const tree = render(ClusterBubble, { count: 42, color: '#abcabc', zoom: 12 });
    expect(getAllText(tree)).toContain('42');
  });

  it('hides the count when zoomed out (dot)', () => {
    const tree = render(ClusterBubble, { count: 42, color: '#abcabc', zoom: 5 });
    expect(getAllText(tree)).toEqual([]);
  });
});

describe('UserPuck', () => {
  it('renders the heading cone only in compass mode', () => {
    const withHeading = render(UserPuck, { heading: 90 });
    expect(
      findAll(withHeading, (n) => n.props.accessibilityLabel === 'heading-cone').length
    ).toBeGreaterThan(0);
    const followOnly = render(UserPuck, { heading: null });
    expect(findAll(followOnly, (n) => n.props.accessibilityLabel === 'heading-cone').length).toBe(
      0
    );
  });
});
