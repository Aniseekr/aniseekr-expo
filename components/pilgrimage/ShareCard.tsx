// Renders the share image that the user captures and posts.
//
// Two axes: template (visual identity) × ratio (aspect for the target
// platform). The wrapper applies the aspect ratio and feeds the inner content
// to one of five template renderers. Each template is responsible for chrome
// only (frame, background, badge style, footer); the image layout (stacked vs.
// side-by-side) is driven by the ratio so every template stays useful in
// every ratio.

import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import type { ThemePalette } from '../../context/ThemeContext';
import {
  getWatermarkAlignment,
  getWatermarkFontStyle,
  resolveBackgroundColor,
  resolveImagePairOrder,
  resolveWatermarkColor,
  type WatermarkFontId,
  type WatermarkPosition,
} from '../../libs/services/pilgrimage/share-composer';
import { FilteredImage } from './FilteredImage';
import type { RNPerspectiveTransform } from '../../libs/services/pilgrimage/share-perspective';

export type ShareTemplate = 'polaroid' | 'classic' | 'minimal' | 'comic' | 'manga';
export type ShareRatio = '1:1' | '9:16' | '16:9';

export type ShareCardProps = {
  template: ShareTemplate;
  ratio: ShareRatio;
  width: number;
  imageUrl: string;
  shotUri: string;
  sceneName: string;
  animeTitle?: string | null;
  episode?: string | null;
  /** Frame match (image similarity) 0–100. Shown as "Match X%". */
  matchScore?: number | null;
  /**
   * Frame-match validity gate. `false` → suppress the score badge regardless
   * of `showScore`, because the underlying photo failed an integrity check
   * (lens covered, flat, no detail). Don't publish a misleading number.
   */
  frameValid?: boolean | null;
  locationText?: string | null;
  date: string;
  accent: string;
  theme: ThemePalette;
  showScore: boolean;
  showLocation: boolean;
  showDate: boolean;
  /** When true, the user shot renders before the anime reference. */
  swapOrder?: boolean;
  /** Hex override for the template canvas (#1 background-color picker). */
  customBg?: string | null;
  /** Sanitised free-text watermark (#3). Pass through `normalizeWatermarkText` first. */
  watermarkText?: string | null;
  watermarkPosition?: WatermarkPosition;
  /** 0–1; the helper clamps anything outside that range. */
  watermarkOpacity?: number;
  /** Hex override; falls back to auto-contrast against the canvas. */
  watermarkColor?: string | null;
  /** Font family identifier; defaults to the system face. */
  watermarkFont?: WatermarkFontId;
  /**
   * 4×5 Skia ColorMatrix applied to the user-shot cell only (#4 filter
   * presets / #5 auto color match). Anime reference stays untouched so the
   * comparison reads honestly. `null` / undefined / identity → expo-image
   * fast path with no Skia overhead.
   */
  shotFilterMatrix?: number[] | null;
  /**
   * RN 3-D transform tokens (perspective + rotateX/rotateY) applied to the
   * user-shot cell only (#8 perspective warp / auto-from-sensor). Empty or
   * undefined → no transform.
   */
  shotPerspectiveTransform?: RNPerspectiveTransform;
};

const RATIO_VALUES: Record<ShareRatio, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
};

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(props, ref) {
  const {
    template,
    ratio,
    width,
    watermarkText,
    watermarkPosition,
    watermarkOpacity,
    watermarkColor,
    watermarkFont,
    theme,
  } = props;
  const aspect = RATIO_VALUES[ratio];
  const height = Math.round(width / aspect);
  const canvasBg = resolveBackgroundColor(template, props.customBg, theme.background.secondary);

  return (
    <View ref={ref} collapsable={false} style={{ width, height, overflow: 'hidden' }}>
      {template === 'polaroid' ? (
        <PolaroidTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'classic' ? (
        <ClassicTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'minimal' ? (
        <MinimalTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : template === 'comic' ? (
        <ComicTemplate {...props} height={height} canvasBg={canvasBg} />
      ) : (
        <MangaTemplate {...props} height={height} canvasBg={canvasBg} />
      )}
      {watermarkText ? (
        <WatermarkOverlay
          text={watermarkText}
          position={watermarkPosition ?? 'bottomRight'}
          opacity={watermarkOpacity ?? 0.85}
          canvasBg={canvasBg}
          color={watermarkColor}
          fontId={watermarkFont ?? 'system'}
        />
      ) : null}
    </View>
  );
});

type TemplateProps = ShareCardProps & { height: number; canvasBg: string };

// ----- shared image layout -----

function ImagePair({
  ratio,
  imageUrl,
  shotUri,
  accent,
  successColor,
  swapOrder = false,
  badgeStyle = 'pill',
  borderRadius = 8,
  gap = 6,
  shotFilterMatrix = null,
  shotPerspectiveTransform,
}: {
  ratio: ShareRatio;
  imageUrl: string;
  shotUri: string;
  accent: string;
  successColor: string;
  swapOrder?: boolean;
  badgeStyle?: 'pill' | 'square' | 'sticker';
  borderRadius?: number;
  gap?: number;
  shotFilterMatrix?: number[] | null;
  shotPerspectiveTransform?: RNPerspectiveTransform;
}) {
  const isPortrait = ratio === '9:16';
  const order = resolveImagePairOrder(swapOrder);
  const cells = {
    anime: (
      <ImageCell
        key="anime"
        uri={imageUrl}
        badge="ANIME"
        color={accent}
        radius={borderRadius}
        style={badgeStyle}
      />
    ),
    real: (
      <ImageCell
        key="real"
        uri={shotUri}
        badge="REAL"
        color={successColor}
        radius={borderRadius}
        style={badgeStyle}
        filterMatrix={shotFilterMatrix}
        perspectiveTransform={shotPerspectiveTransform}
      />
    ),
  };
  return (
    <View
      style={{
        flex: 1,
        flexDirection: isPortrait ? 'column' : 'row',
        gap,
      }}>
      {cells[order.first]}
      {cells[order.second]}
    </View>
  );
}

function WatermarkOverlay({
  text,
  position,
  opacity,
  canvasBg,
  color,
  fontId,
}: {
  text: string;
  position: WatermarkPosition;
  opacity: number;
  canvasBg: string;
  color: string | null | undefined;
  fontId: WatermarkFontId;
}) {
  const alignment = getWatermarkAlignment(position, 14);
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const ink = resolveWatermarkColor(color, canvasBg);
  // Use the contrast helper purely to pick a shadow direction that stays
  // legible regardless of which way the auto ink leans.
  const shadow = readableTextOn(canvasBg) === '#FFFFFF' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)';
  const fontStyle = getWatermarkFontStyle(fontId);
  return (
    <View pointerEvents="none" style={alignment}>
      <ThemedText
        variant="bodySmall"
        weight={fontStyle.fontWeight ?? '700'}
        numberOfLines={2}
        style={{
          color: ink,
          opacity: clampedOpacity,
          letterSpacing: fontStyle.letterSpacing,
          fontFamily: fontStyle.fontFamily,
          maxWidth: 260,
          textShadowColor: shadow,
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
          textAlign: position === 'center' ? 'center' : 'left',
        }}>
        {text}
      </ThemedText>
    </View>
  );
}

function ImageCell({
  uri,
  badge,
  color,
  radius,
  style,
  filterMatrix = null,
  perspectiveTransform,
}: {
  uri: string;
  badge: string;
  color: string;
  radius: number;
  style: 'pill' | 'square' | 'sticker';
  filterMatrix?: number[] | null;
  perspectiveTransform?: RNPerspectiveTransform;
}) {
  const hasTransform = perspectiveTransform && perspectiveTransform.length > 0;
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        position: 'relative',
      }}>
      {hasTransform ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { transform: perspectiveTransform as RNPerspectiveTransform },
          ]}>
          <FilteredImage uri={uri} matrix={filterMatrix} contentFit="cover" />
        </View>
      ) : (
        <FilteredImage uri={uri} matrix={filterMatrix} contentFit="cover" />
      )}
      {style === 'sticker' ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: '#000',
            transform: [{ rotate: '-3deg' }],
          }}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: readableTextOn(color), letterSpacing: 1 }}>
            {badge}
          </ThemedText>
        </View>
      ) : style === 'square' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderRightWidth: 2,
            borderBottomWidth: 2,
            borderColor: color,
          }}>
          <ThemedText variant="captionSmall" weight="700" style={{ color, letterSpacing: 1 }}>
            {badge}
          </ThemedText>
        </View>
      ) : (
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderWidth: 1,
            borderColor: color,
          }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
          <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
            {badge}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

// ----- POLAROID -----

function PolaroidTemplate(props: TemplateProps) {
  const {
    ratio,
    imageUrl,
    shotUri,
    sceneName,
    episode,
    date,
    accent,
    theme,
    showScore,
    frameValid,
    showDate,
    showLocation,
    locationText,
    matchScore,
    swapOrder,
    canvasBg,
  } = props;
  const successColor = theme.status.success;
  const captionHeight = ratio === '9:16' ? 110 : 80;
  const captionInk = readableTextOn(canvasBg);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: canvasBg,
        padding: 12,
        paddingBottom: captionHeight,
        position: 'relative',
      }}>
      {/* Washi-tape stickers */}
      <View
        style={{
          position: 'absolute',
          top: -8,
          left: 24,
          width: 56,
          height: 16,
          backgroundColor: 'rgba(255,159,10,0.55)',
          transform: [{ rotate: '-8deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: -6,
          right: 30,
          width: 48,
          height: 14,
          backgroundColor: 'rgba(100,180,220,0.55)',
          transform: [{ rotate: '6deg' }],
        }}
      />

      <View style={{ flex: 1 }}>
        <ImagePair
          ratio={ratio}
          imageUrl={imageUrl}
          shotUri={shotUri}
          accent={accent}
          successColor={successColor}
          swapOrder={swapOrder}
          badgeStyle="pill"
          borderRadius={4}
          gap={6}
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
        />
      </View>

      {/* Caption strip */}
      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          height: captionHeight - 24,
          paddingHorizontal: 4,
          justifyContent: 'center',
        }}>
        <ThemedText
          variant="titleSmall"
          weight="700"
          numberOfLines={1}
          style={{ color: captionInk, fontStyle: 'italic' }}>
          {sceneName}
        </ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {episode ? (
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{ color: captionInk, opacity: 0.7 }}>
              EP {episode}
            </ThemedText>
          ) : null}
          {showDate ? (
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{ color: captionInk, opacity: 0.7, fontStyle: 'italic' }}>
              · {date}
            </ThemedText>
          ) : null}
        </View>
        {showLocation && locationText ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Ionicons name="location" size={10} color={accent} />
            <ThemedText
              variant="captionSmall"
              weight="600"
              numberOfLines={1}
              style={{ color: captionInk, opacity: 0.7 }}>
              {locationText}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {showScore && frameValid !== false && matchScore !== null && matchScore !== undefined ? (
        <View
          style={{
            position: 'absolute',
            bottom: captionHeight - 18,
            right: 12,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: accent,
            borderWidth: 3,
            borderColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '8deg' }],
          }}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            style={{ color: readableTextOn(accent), lineHeight: 18 }}>
            {matchScore}
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: readableTextOn(accent), letterSpacing: 0.5 }}>
            MATCH
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

// ----- CLASSIC -----

function ClassicTemplate(props: TemplateProps) {
  const {
    ratio,
    imageUrl,
    shotUri,
    sceneName,
    animeTitle,
    episode,
    date,
    accent,
    theme,
    showScore,
    frameValid,
    showDate,
    showLocation,
    locationText,
    matchScore,
    swapOrder,
    canvasBg,
  } = props;
  const accentFg = readableTextOn(accent);
  const successColor = theme.status.success;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: canvasBg,
        borderWidth: 1,
        borderColor: theme.glassBorder,
        padding: 14,
        gap: 10,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
            {sceneName}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
            {animeTitle
              ? `${animeTitle}${episode ? ` · EP ${episode}` : ''}`
              : episode
                ? `EP ${episode} · Pilgrimage`
                : 'Pilgrimage'}
          </ThemedText>
        </View>
        {showScore && frameValid !== false && matchScore !== null && matchScore !== undefined ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: `${successColor}22`,
              borderWidth: 1,
              borderColor: successColor,
            }}>
            <Ionicons name="checkmark-circle" size={12} color={successColor} />
            <ThemedText variant="captionSmall" weight="700" style={{ color: successColor }}>
              Match {matchScore}%
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <ImagePair
          ratio={ratio}
          imageUrl={imageUrl}
          shotUri={shotUri}
          accent={accent}
          successColor={successColor}
          swapOrder={swapOrder}
          badgeStyle="pill"
          borderRadius={12}
          gap={8}
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {showDate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={11} color={theme.text.secondary} />
            <ThemedText variant="captionSmall" tone="secondary" weight="600">
              {date}
            </ThemedText>
          </View>
        ) : null}
        {showLocation && locationText ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <Ionicons name="location" size={11} color={accent} />
            <ThemedText
              variant="captionSmall"
              weight="600"
              numberOfLines={1}
              style={{ color: accent }}>
              {locationText}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: theme.glassBorder,
        }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="navigate" size={10} color={accentFg} />
        </View>
        <ThemedText variant="bodySmall" weight="700" style={{ flex: 1 }}>
          aniseekr · Pilgrimage
        </ThemedText>
      </View>
    </View>
  );
}

// ----- MINIMAL -----

function MinimalTemplate(props: TemplateProps) {
  const {
    ratio,
    imageUrl,
    shotUri,
    sceneName,
    episode,
    date,
    accent,
    theme,
    showScore,
    frameValid,
    showDate,
    showLocation,
    locationText,
    matchScore,
    swapOrder,
    canvasBg,
  } = props;
  const successColor = theme.status.success;
  const isDarkBg = readableTextOn(canvasBg) === '#FFFFFF';
  const titleInk = isDarkBg ? '#fff' : '#0E0A06';
  const subInk = isDarkBg ? 'rgba(255,255,255,0.6)' : 'rgba(14,10,6,0.6)';
  const gradientFade = isDarkBg ? ['transparent', 'rgba(0,0,0,0.85)'] : ['transparent', 'rgba(245,241,232,0.9)'];
  return (
    <View style={{ flex: 1, backgroundColor: canvasBg }}>
      <View style={{ flex: 1 }}>
        <ImagePair
          ratio={ratio}
          imageUrl={imageUrl}
          shotUri={shotUri}
          accent={accent}
          successColor={successColor}
          swapOrder={swapOrder}
          badgeStyle="square"
          borderRadius={0}
          gap={2}
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
        />
      </View>
      <LinearGradient
        colors={gradientFade as [string, string]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 96,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            numberOfLines={1}
            style={{ color: titleInk, flex: 1 }}>
            {sceneName}
          </ThemedText>
          {showScore && frameValid !== false && matchScore !== null && matchScore !== undefined ? (
            <ThemedText
              variant="titleSmall"
              weight="700"
              style={{ color: accent, fontVariant: ['tabular-nums'] }}>
              {matchScore}
            </ThemedText>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {episode ? (
            <ThemedText variant="captionSmall" weight="600" style={{ color: subInk }}>
              EP {episode}
            </ThemedText>
          ) : null}
          {showDate ? (
            <ThemedText variant="captionSmall" weight="600" style={{ color: subInk }}>
              {date}
            </ThemedText>
          ) : null}
          {showLocation && locationText ? (
            <ThemedText
              variant="captionSmall"
              weight="600"
              numberOfLines={1}
              style={{ color: subInk, flex: 1 }}>
              {locationText}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ----- COMIC -----

function ComicTemplate(props: TemplateProps) {
  const {
    ratio,
    imageUrl,
    shotUri,
    sceneName,
    episode,
    date,
    accent,
    theme,
    showScore,
    frameValid,
    showDate,
    showLocation,
    locationText,
    matchScore,
    swapOrder,
    canvasBg,
  } = props;
  const successColor = theme.status.success;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: canvasBg,
        borderWidth: 4,
        borderColor: '#000',
        padding: 10,
        gap: 8,
      }}>
      <HalftoneOverlay />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
        <View
          style={{
            flex: 1,
            backgroundColor: '#000',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 4,
            transform: [{ rotate: '-1deg' }],
          }}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            numberOfLines={1}
            style={{ color: '#FFE45C', letterSpacing: 0.5 }}>
            {sceneName.toUpperCase()}
          </ThemedText>
        </View>
        {showScore && frameValid !== false && matchScore !== null && matchScore !== undefined ? (
          <SpeechBubble color="#FF4F8F">{`${matchScore}%`}</SpeechBubble>
        ) : null}
      </View>

      <View
        style={{
          flex: 1,
          borderWidth: 3,
          borderColor: '#000',
          backgroundColor: '#000',
          padding: 3,
        }}>
        <ImagePair
          ratio={ratio}
          imageUrl={imageUrl}
          shotUri={shotUri}
          accent={accent}
          successColor={successColor}
          swapOrder={swapOrder}
          badgeStyle="sticker"
          borderRadius={0}
          gap={3}
          shotFilterMatrix={props.shotFilterMatrix}
          shotPerspectiveTransform={props.shotPerspectiveTransform}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {episode ? (
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#000', letterSpacing: 0.5 }}>
              {`EP ${episode}`}
            </ThemedText>
          ) : null}
          {showDate ? (
            <ThemedText variant="captionSmall" weight="700" style={{ color: '#000' }}>
              ✦ {date}
            </ThemedText>
          ) : null}
        </View>
        {showLocation && locationText ? (
          <ThemedText
            variant="captionSmall"
            weight="700"
            numberOfLines={1}
            style={{ color: '#000', maxWidth: 160 }}>
            📍 {locationText}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function SpeechBubble({ children, color }: { children: string; color: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 3,
        borderColor: '#000',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        transform: [{ rotate: '4deg' }],
      }}>
      <ThemedText variant="titleSmall" weight="700" style={{ color, letterSpacing: 0.5 }}>
        {children}
      </ThemedText>
    </View>
  );
}

function HalftoneOverlay() {
  const rows = 6;
  const cols = 10;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {Array.from({ length: cols }).map((__, c) => {
            const offset = r % 2 === 0 ? 0 : 6;
            return (
              <View
                key={c}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  marginLeft: offset,
                  marginTop: 4,
                  backgroundColor: 'rgba(0,0,0,0.18)',
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ----- MANGA -----

function MangaTemplate(props: TemplateProps) {
  const {
    ratio,
    imageUrl,
    shotUri,
    sceneName,
    episode,
    date,
    theme,
    showScore,
    frameValid,
    showDate,
    showLocation,
    locationText,
    matchScore,
    swapOrder,
    canvasBg,
  } = props;
  const successColor = theme.status.success;
  const order = resolveImagePairOrder(!!swapOrder);
  const cells = {
    anime: (
      <View key="anime" style={{ flex: 1, position: 'relative' }}>
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <SpeedLines side={ratio === '9:16' ? 'top' : 'left'} />
        <View
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#000',
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: '#000', letterSpacing: 1 }}>
            Anime
          </ThemedText>
        </View>
      </View>
    ),
    real: (
      <View key="real" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {props.shotPerspectiveTransform && props.shotPerspectiveTransform.length > 0 ? (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { transform: props.shotPerspectiveTransform as RNPerspectiveTransform },
            ]}>
            <FilteredImage
              uri={shotUri}
              matrix={props.shotFilterMatrix ?? null}
              contentFit="cover"
            />
          </View>
        ) : (
          <FilteredImage
            uri={shotUri}
            matrix={props.shotFilterMatrix ?? null}
            contentFit="cover"
          />
        )}
        <SpeedLines side={ratio === '9:16' ? 'bottom' : 'right'} />
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            backgroundColor: successColor,
            borderWidth: 1,
            borderColor: '#000',
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: readableTextOn(successColor), letterSpacing: 1 }}>
            Real
          </ThemedText>
        </View>
      </View>
    ),
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: canvasBg,
        borderWidth: 3,
        borderColor: '#000',
        padding: 8,
        gap: 6,
      }}>
      <ScreenToneBackground />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 4,
        }}>
        <View
          style={{
            width: 18,
            height: 18,
            backgroundColor: '#000',
            transform: [{ rotate: '45deg' }],
          }}
        />
        <View style={{ flex: 1 }}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            numberOfLines={1}
            style={{ color: '#000', letterSpacing: 1 }}>
            {sceneName}
          </ThemedText>
          {episode ? (
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#000', letterSpacing: 2 }}>
              EP {episode}
            </ThemedText>
          ) : null}
        </View>
        {showScore && frameValid !== false && matchScore !== null && matchScore !== undefined ? (
          <View
            style={{
              borderWidth: 2,
              borderColor: '#000',
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: '#fff',
            }}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#000', letterSpacing: 1 }}>
              Match {matchScore}%
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View
        style={{
          flex: 1,
          borderWidth: 2,
          borderColor: '#000',
          flexDirection: ratio === '9:16' ? 'column' : 'row',
          gap: 0,
        }}>
        {cells[order.first]}
        <View
          style={{
            backgroundColor: '#000',
            ...(ratio === '9:16' ? { height: 3 } : { width: 3 }),
          }}
        />
        {cells[order.second]}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}>
        {showDate ? (
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: '#000', letterSpacing: 1, fontVariant: ['tabular-nums'] }}>
            {date.replace(/\./g, '/')}
          </ThemedText>
        ) : (
          <View />
        )}
        {showLocation && locationText ? (
          <ThemedText
            variant="captionSmall"
            weight="700"
            numberOfLines={1}
            style={{ color: '#000', maxWidth: 200 }}>
            ◇ {locationText}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function ScreenToneBackground() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.08,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}>
      {Array.from({ length: 200 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 6,
            height: 6,
            margin: 4,
            borderRadius: 3,
            backgroundColor: '#000',
          }}
        />
      ))}
    </View>
  );
}

function SpeedLines({ side }: { side: 'left' | 'right' | 'top' | 'bottom' }) {
  const isVertical = side === 'left' || side === 'right';
  const positions = [0.15, 0.32, 0.52, 0.7, 0.88];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {positions.map((p) => {
        const style = isVertical
          ? {
              position: 'absolute' as const,
              top: `${p * 100}%` as `${number}%`,
              [side]: 0,
              height: 2,
              width: '34%' as const,
              backgroundColor: 'rgba(255,255,255,0.5)',
            }
          : {
              position: 'absolute' as const,
              left: `${p * 100}%` as `${number}%`,
              [side]: 0,
              width: 2,
              height: '34%' as const,
              backgroundColor: 'rgba(255,255,255,0.5)',
            };
        return <View key={p} style={style} />;
      })}
    </View>
  );
}

export const SHARE_TEMPLATES: { id: ShareTemplate; label: string; emoji: string }[] = [
  { id: 'polaroid', label: 'Polaroid', emoji: '📷' },
  { id: 'classic', label: 'Classic', emoji: '◆' },
  { id: 'minimal', label: 'Minimal', emoji: '◻' },
  { id: 'comic', label: 'Comic', emoji: '✦' },
  { id: 'manga', label: 'Manga', emoji: '✎' },
];

export const SHARE_RATIOS: { id: ShareRatio; label: string; hint: string }[] = [
  { id: '1:1', label: '1:1', hint: 'Feed' },
  { id: '9:16', label: '9:16', hint: 'Story' },
  { id: '16:9', label: '16:9', hint: 'X' },
];

// Re-export for callers that want to compute aspect.
export function ratioToAspect(ratio: ShareRatio): number {
  return RATIO_VALUES[ratio];
}
