import { characterService, Character } from './character-service';

// AsyncStorage fallback for when package is not installed
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // Fallback to in-memory storage if AsyncStorage is not available
  const memoryStorage: Record<string, string> = {};
  AsyncStorage = {
    getItem: async (key: string) => memoryStorage[key] || null,
    setItem: async (key: string, value: string) => {
      memoryStorage[key] = value;
    },
    removeItem: async (key: string) => {
      delete memoryStorage[key];
    },
  };
}

export type CardRarity = 'SSR' | 'SR' | 'R' | 'N';

export interface GachaCard {
  id: string;
  characterId: number;
  characterName: string;
  imageUrl: string;
  rarity: CardRarity;
  isDuplicate?: boolean;
  shardReward?: number;
  pulledAt: number;
}

interface UserGachaData {
  coins: number;
  shards: number;
  ownedCards: GachaCard[];
  pullHistory: GachaCard[];
}

const RARITY_PROBABILITIES: Record<CardRarity, number> = {
  SSR: 0.03,
  SR: 0.12,
  R: 0.35,
  N: 0.5,
};

const RARITY_SHARD_VALUES: Record<CardRarity, number> = {
  SSR: 50,
  SR: 20,
  R: 5,
  N: 1,
};

const STORAGE_KEY = '@gacha_user_data';
const DEFAULT_COINS = 500;
const PULL_COST = 100;

class GachaService {
  private static instance: GachaService;
  private userData: UserGachaData | null = null;

  private constructor() {}

  static getInstance(): GachaService {
    if (!GachaService.instance) {
      GachaService.instance = new GachaService();
    }
    return GachaService.instance;
  }

  /**
   * Initialize gacha pool (call on app start)
   */
  async initializePool(): Promise<void> {
    try {
      await characterService.buildGachaPool(100);
    } catch (error) {
      console.error('Error initializing gacha pool:', error);
    }
  }

  /**
   * Load user data from storage
   */
  async loadUserData(): Promise<UserGachaData> {
    if (this.userData) {
      return this.userData;
    }

    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        this.userData = JSON.parse(data);
        return this.userData!;
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }

    // Initialize default data
    this.userData = {
      coins: DEFAULT_COINS,
      shards: 0,
      ownedCards: [],
      pullHistory: [],
    };
    await this.saveUserData();
    return this.userData;
  }

  /**
   * Save user data to storage
   */
  private async saveUserData(): Promise<void> {
    if (!this.userData) return;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.userData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  }

  /**
   * Get user coins
   */
  async getCoins(): Promise<number> {
    const data = await this.loadUserData();
    return data.coins;
  }

  /**
   * Add coins to user
   */
  async addCoins(amount: number): Promise<void> {
    const data = await this.loadUserData();
    data.coins += amount;
    await this.saveUserData();
  }

  /**
   * Get user shards
   */
  async getShards(): Promise<number> {
    const data = await this.loadUserData();
    return data.shards;
  }

  /**
   * Get user's owned cards
   */
  async getUserCards(): Promise<GachaCard[]> {
    const data = await this.loadUserData();
    return data.ownedCards;
  }

  /**
   * Get pull history
   */
  async getPullHistory(): Promise<GachaCard[]> {
    const data = await this.loadUserData();
    return data.pullHistory;
  }

  /**
   * Perform a multi-card gacha pull
   */
  async performMultiPull(count: number = 5): Promise<GachaCard[]> {
    // Ensure pool is initialized
    const pool = characterService.getGachaPool();
    if (pool.length === 0) {
      await this.initializePool();
    }

    const finalPool = characterService.getGachaPool();
    if (finalPool.length === 0) {
      throw new Error('Gacha pool is empty. Please try again later.');
    }

    // Check coins
    const userData = await this.loadUserData();
    const totalCost = PULL_COST;
    if (userData.coins < totalCost) {
      throw new Error('Insufficient coins for gacha pull.');
    }

    // Get existing card IDs
    const existingCardIds = new Set(userData.ownedCards.map((card) => card.characterId));

    const pulledCards: GachaCard[] = [];
    const newCards: GachaCard[] = [];
    let totalShardsEarned = 0;

    // Pull multiple cards
    for (let i = 0; i < count; i++) {
      // Determine rarity based on distribution
      const rarity = this.randomRarity();

      // Select random character from pool
      const randomCharacter = finalPool[Math.floor(Math.random() * finalPool.length)];

      // Create card
      const card: GachaCard = {
        id: `${Date.now()}-${i}`,
        characterId: randomCharacter.id,
        characterName: randomCharacter.name,
        imageUrl: randomCharacter.images.jpg.imageUrl,
        rarity,
        pulledAt: Date.now(),
      };

      // Check for duplicate
      if (
        existingCardIds.has(card.characterId) ||
        newCards.some((c) => c.characterId === card.characterId)
      ) {
        // It's a duplicate!
        card.isDuplicate = true;
        card.shardReward = RARITY_SHARD_VALUES[rarity];
        totalShardsEarned += card.shardReward;
      } else {
        // It's new!
        newCards.push(card);
        existingCardIds.add(card.characterId);
      }

      pulledCards.push(card);
    }

    // Update user data
    userData.coins -= totalCost;
    userData.ownedCards.push(...newCards);
    userData.pullHistory.unshift(...pulledCards);
    // Keep only last 100 pulls in history
    if (userData.pullHistory.length > 100) {
      userData.pullHistory = userData.pullHistory.slice(0, 100);
    }
    userData.shards += totalShardsEarned;

    await this.saveUserData();

    console.log(
      `🎴 Gacha pull result: ${pulledCards.length} cards pulled (${newCards.length} new, ${pulledCards.length - newCards.length} duplicates)`
    );
    if (totalShardsEarned > 0) {
      console.log(`💎 Converted duplicates into ${totalShardsEarned} shards`);
    }

    return pulledCards;
  }

  /**
   * Get cards by rarity
   */
  async getUserCardsByRarity(rarity: CardRarity): Promise<GachaCard[]> {
    const allCards = await this.getUserCards();
    return allCards.filter((card) => card.rarity === rarity);
  }

  /**
   * Random rarity based on probabilities
   */
  private randomRarity(): CardRarity {
    const rand = Math.random();
    let cumulative = 0;

    for (const [rarity, probability] of Object.entries(RARITY_PROBABILITIES)) {
      cumulative += probability;
      if (rand <= cumulative) {
        return rarity as CardRarity;
      }
    }

    return 'N'; // Fallback
  }
}

export const gachaService = GachaService.getInstance();
export const PULL_COST_CONST = PULL_COST;
