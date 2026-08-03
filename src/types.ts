export type Category = 'bakery' | 'brunch' | 'cafe' | 'dessert';

export type Place = {
  id: string; // 카카오 place id
  name: string;
  category: Category[];
  lat: number;
  lng: number;
  address: string;
  region: { sido: string; sigungu: string };

  score: number; // 0~100
  scoreParts: { mention: number; buzz: number; mine: number | null };
  mentions: number; // 서로 다른 블로그 포스트에서 언급된 횟수

  tags: string[];
  hours?: string;
  closedDay?: string;
  phone?: string;
  placeUrl: string; // 카카오맵 상세 링크

  firstSeen: string; // ISO date — "신규" 배지 판단용
  lastSeen: string;
};

export type PlacesFile = {
  generatedAt: string;
  count: number;
  places: Place[];
};

/** 사용자가 기기에 남기는 개인 기록. 서버로 나가지 않는다. */
export type UserRecord = {
  wish?: boolean;
  visited?: { date: string; rating: number; memo?: string };
};

export const CATEGORY_LABEL: Record<Category, string> = {
  bakery: '베이커리',
  brunch: '브런치',
  cafe: '카페',
  dessert: '디저트',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  bakery: '#c8763c',
  brunch: '#5c8a4a',
  cafe: '#7a6a58',
  dessert: '#b5578c',
};
