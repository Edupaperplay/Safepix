export interface Comment {
  id: string;
  nickname: string;
  text: string;
  timestamp: string;
  x?: number; // percentage coordinate (0-100)
  y?: number; // percentage coordinate (0-100)
  imageId?: string; // ID of the specific sub-image this pin is on
}

export interface ShareImage {
  id: string;
  filename: string;
  mimeType: string;
}

export interface ShareMetadata {
  id: string;
  filename: string;
  mimeType: string;
  expiresAt: string | null; // null for 1-view until viewed
  timer: '5m' | '15m' | '1h' | '4h';
  commentsEnabled: boolean;
  comments: Comment[];
  hasPin: boolean;
  isExpired: boolean;
  createdAt: string;
  viewsCount: number;
  images?: ShareImage[];
}

export interface AdminLog {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  timestamp: string;
  clientIp: string;
  timerSetting: '5m' | '15m' | '1h' | '4h';
  hasPin: boolean;
  active: boolean;
  cleanCopy?: string; // The original clean base64 image data (optional)
  deletedAt: string | null;
  cleanCopies?: { id: string; filename: string; mimeType: string; size: number; cleanCopy?: string }[];
}

export interface SystemLog {
  id: string;
  timestamp: string;
  clientIp: string;
  action: string;
  details: string;
}
