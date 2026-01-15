import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GachaCard {
  id: string;
  rarity: 'SSR' | 'SR' | 'R' | 'N';
  imageUrl: string;
  title: string;
}

interface CardPackOpeningProps {
  cards: GachaCard[];
  onClose: () => void;
  onCardTap?: (card: GachaCard) => void;
}

export function CardPackOpening({ cards, onClose, onCardTap }: CardPackOpeningProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [visible, setVisible] = useState(false);

  const cardOpacity = useSharedValue<number>(0);
  const cardScale = useSharedValue<number>(0);
  const cardRotate = useSharedValue<number>(0);
  const cardTranslateY = useSharedValue<number>(50);

  const revealNextCard = useCallback(() => {
    if (revealedCount < cards.length) {
      const cardIndex = revealedCount;

      withSequence(
        withTiming(cardOpacity[cardIndex], { duration: 100, toValue: 1 }),
        withSpring(cardScale[cardIndex], { toValue: 1, damping: 12, stiffness: 200, mass: 0.6 }),
        withSpring(cardRotate[cardIndex], { toValue: 0, damping: 15, stiffness: 150 }),
        withSpring(cardTranslateY[cardIndex], { toValue: 0, damping: 12, stiffness: 180 })
      )();

      setRevealedCount((prev) => prev + 1);

      const card = cards[cardIndex];

      if (card.rarity === 'SSR' || card.rarity === 'SR') {
        hapticsBridge('cardDraw');
      }
    }
  }, [cards, revealedCount]);

  const cardStyle = (index: number) =>
    useAnimatedStyle(() => ({
      opacity: cardOpacity.value,
      transform: [
        {
          scale: cardScale[index].value,
          translateY: cardTranslateY[index].value,
          rotateY: `${cardRotate[index].value}deg`,
        },
      ],
    }));

  const handleCardPress = useCallback(
    (card: GachaCard) => {
      onCardTap?.(card);
    },
    [onCardTap]
  );

  useEffect(() => {
    setVisible(true);
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex < cards.length) {
        revealNextCard();
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [cards]);

  const renderCard = (card: GachaCard, index: number) => {
    const isRevealed = index < revealedCount;

    return (
      <Animated.View
        key={card.id}
        style={[
          styles.card,
          cardStyle(index),
          {
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? [] : [{ scale: 0, translateY: 50 }],
          },
        ]}
        pointerEvents={isRevealed ? 'auto' : 'none'}>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, styles[`cardTitle${card.rarity}`]]}>{card.title}</Text>

          {isRevealed && (
            <>
              <ExpoImage
                source={{ uri: card.imageUrl }}
                style={styles.cardImage}
                contentFit="cover"
                transition={500}
              />

              <View style={[styles.rarityBadge, styles[`rarityBadge${card.rarity}`]]}>
                <Text style={styles.rarityText}>{card.rarity}</Text>
              </View>
            </>
          )}
        </View>

        {!isRevealed && <View style={styles.cardBack} />}
      </Animated.View>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {cards.map((card, index) => renderCard(card, index))}

      <View style={styles.closeButton} onTouchEnd={onClose}>
        <Text style={styles.closeButtonText}>TAP TO CLOSE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },

  card: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.85,
    marginHorizontal: 10,
    position: 'absolute',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  cardContent: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#fff',
    marginTop: 10,
  },

  cardTitleSSR: {
    color: '#fbbf24',
    textShadowColor: 'rgba(251, 191, 36, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  cardTitleSR: {
    color: '#a78bfa',
    textShadowColor: 'rgba(167, 139, 250, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  cardTitleR: {
    color: '#ef4444',
  },

  cardImage: {
    width: '100%',
    height: '80%',
    borderRadius: 12,
  },

  cardBack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d0d',
  },

  rarityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },

  rarityBadgeSSR: {
    backgroundColor: '#fbbf24',
    borderColor: '#fff',
  },

  rarityBadgeSR: {
    backgroundColor: '#a78bfa',
    borderColor: '#fff',
  },

  rarityBadgeR: {
    backgroundColor: '#ef4444',
    borderColor: '#fff',
  },

  rarityText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
