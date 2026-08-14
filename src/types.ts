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

/* -------------------------------------------------------------------------
 * 부가 정보. places.json 과 따로 받아온다 — 첫 화면에는 지도와 목록만 있으면
 * 되는데 여기까지 합치면 첫 로딩이 배로 무거워진다.
 * ---------------------------------------------------------------------- */

export type MenuItem = { name: string; price: number };

export type BlogPost = {
  title: string;
  link: string;
  blogger: string;
  date: string;
};

export type Facility = {
  /** 블로그 본문이 말하는 주차 사정. */
  parkingHint: 'yes' | 'hard' | 'unknown';
  /** 반경 300m 안의 주차장 수. 가게 전용 주차장이 아니라 '주변'이다. */
  parkingNearby: number;
  parkingNearest?: { name: string; distance: number };
  /** 반경 700m 안의 전기차 충전소 수. */
  evNearby: number;
  evNearest?: { name: string; distance: number };
  kids: 'ok' | 'no' | 'unknown';
};

export type PlaceDetails = {
  id: string;
  photo?: { thumb: string; title: string };
  menus: MenuItem[];
  blogs: BlogPost[];
  facility: Facility;
  enrichedAt: string;
};

export type DetailsFile = {
  generatedAt: string;
  count: number;
  details: PlaceDetails[];
};
