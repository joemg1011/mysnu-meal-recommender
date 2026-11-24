import type { CalorieEstimate } from './calories';
export type Menu = Omit<CalorieEstimate, 'confidence'> & {
    id: string;
    name: string;
    category: string;
    tags: string[];
    score: number;
    votes: number;
    confidence: CalorieEstimate['confidence'] | '높음';
    price?: number;
};
export type Meal = {
    id: string;
    cafeteria: string;
    location: string;
    time: '조식' | '중식' | '석식';
    emoji: string;
    menu: Menu[];
};
export type SavedUpload = Meal & {
    date: string;
};
export type MealRecord = {
    id: string;
    name: string;
    category: string;
    cafeteria: string;
    kcal: number | null;
    confirmed?: boolean;
    example?: boolean;
};
export type LocalData = {
    version: 1;
    recordsByDate: Record<string, MealRecord[]>;
    votes: Record<string, 'like' | 'dislike'>;
    target: string;
    targetKcal: number;
    preferredCategories: string[];
    allergies: string[];
    dislikedIngredients: string;
    uploads: SavedUpload[];
};
export const CATEGORY_OPTIONS = ['한식', '양식', '일식', '샐러드'];
export const ALLERGY_OPTIONS = ['견과류', '갑각류', '유제품', '계란'];
export type SyncState = 'loading' | 'live' | 'cached' | 'empty' | 'error';
export const LOCAL_DATA_KEY = 'mysnu-local-data-v1';
export const CALORIE_OVERRIDES_KEY = 'mysnu-calorie-overrides-v1';
export function menuCategory(name: string) {
    if (/샐러드|포케/.test(name))
        return '샐러드';
    if (/파스타|리조또|피자|버거|스테이크|샌드위치/.test(name))
        return '양식';
    if (/카레|우동|돈까스|돈가스|소바|라멘|가츠/.test(name))
        return '일식';
    if (/쌀국수|짜장|짬뽕|마라탕/.test(name))
        return '기타';
    if (/밥|국|찌개|탕|제육|불고기|비빔|김치|나물|떡볶이/.test(name))
        return '한식';
    return '기타';
}
