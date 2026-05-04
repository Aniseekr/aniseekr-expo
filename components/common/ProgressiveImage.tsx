import { memo, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image, ImageProps } from 'expo-image';
import { ShimmerEffect } from './ShimmerEffect';
import { Radius } from '../../constants/DesignSystem';

interface ProgressiveImageProps extends Omit<ImageProps, 'source'> {
  source: { uri: string } | number;
  borderRadius?: number;
  showShimmer?: boolean;
  containerStyle?: ViewStyle;
  blurhash?: string;
}

const FALLBACK_BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

function ProgressiveImageComponent({
  source,
  borderRadius = Radius.md,
  showShimmer = true,
  containerStyle,
  blurhash = FALLBACK_BLURHASH,
  contentFit = 'cover',
  transition = 280,
  style,
  ...rest
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <View style={[{ borderRadius, overflow: 'hidden' }, containerStyle]}>
      {showShimmer && !loaded && !errored ? (
        <ShimmerEffect
          width="100%"
          height="100%"
          borderRadius={borderRadius}
          style={StyleSheet.absoluteFill as ViewStyle}
        />
      ) : null}
      <Image
        source={source}
        placeholder={blurhash ? { blurhash } : undefined}
        contentFit={contentFit}
        transition={transition}
        cachePolicy="memory-disk"
        style={[styles.image, style]}
        onLoadEnd={() => setLoaded(true)}
        onError={() => setErrored(true)}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});

export const ProgressiveImage = memo(ProgressiveImageComponent);
