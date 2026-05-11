export interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isShared: boolean;
  isSystemFolder: boolean;
  isR18: boolean;
  folderType: 'custom' | 'wishlist' | 'favorites' | 'watching' | 'completed' | 'dropped';
  createdAt: Date;
  animeCount: number;
  sharedBy: number;
  sortOrder?: number;
  coverUrl?: string;
}
