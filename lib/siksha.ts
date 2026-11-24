import { estimateCalories } from './calories.ts';
import { menuCategory, type Meal } from './meal-model.ts';
type Raw = Record<string, any>;
const SIKSHA_API = 'https://siksha-server.wafflestudio.com';
const CACHE_KEY = 'mysnu-menu-cache-v1';
type Cache = Record<string, {
    payload: unknown;
    fetchedAt: string;
}>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function parseSiksha(payload: unknown, date: string): Meal[] {
    if (!payload || !Array.isArray((payload as Raw).result))
        throw new Error('식단 응답 형식을 확인할 수 없어요.');
    const result = (payload as Raw).result;
    const day = result.find((entry: Raw) => entry?.date === date);
    if (!day) {
        if (result.length)
            throw new Error('요청한 날짜와 다른 식단이 도착했어요.');
        return [];
    }
    return (['br', 'lu', 'dn'] as const).flatMap(group => {
        if (!Array.isArray(day[group]))
            throw new Error('끼니별 식단 응답이 올바르지 않아요.');
        return day[group].filter((restaurant: Raw) => restaurant && Array.isArray(restaurant.menus) && restaurant.menus.length).map((restaurant: Raw): Meal => ({
            id: `siksha-${group}-${restaurant.id}`, cafeteria: String(restaurant.name_kr || restaurant.nameKr || '식샤 등록 식당'), location: String(restaurant.addr || '식샤 연동 식당'),
            time: group === 'br' ? '조식' : group === 'dn' ? '석식' : '중식', emoji: group === 'br' ? '🥪' : group === 'dn' ? '🍱' : '🍽️',
            menu: restaurant.menus.filter((item: Raw) => item && item.id != null && typeof (item.name_kr || item.nameKr) === 'string').map((item: Raw) => {
                const name = String(item.name_kr || item.nameKr).replace(/<|>/g, '');
                return { id: `siksha-${item.id}`, name, ...estimateCalories(name), category: menuCategory(name), tags: ['식샤'],
                    score: Number.isFinite(Number(item.score)) ? Math.min(5, Math.max(0, Number(item.score))) : 0,
                    votes: Math.max(0, Number(item.review_cnt) || 0), price: item.price == null || !Number.isFinite(Number(item.price)) ? undefined : Number(item.price) };
            })
        })).filter((meal: Meal) => meal.menu.length);
    });
}
export async function fetchSiksha(date: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch) {
    const response = await fetchImpl(`${SIKSHA_API}/menus/web?start_date=${date}&end_date=${date}&except_empty=false`, { signal });
    if (!response.ok)
        throw new Error(`식샤 연결 오류 (${response.status})`);
    const payload: unknown = await response.json();
    const meals = parseSiksha(payload, date);
    return { payload, meals };
}
export function readMenuCache(storage: StorageLike, date: string) {
    try {
        const cache: Cache = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
        const entry = cache?.[date];
        if (!entry || !Number.isFinite(Date.parse(entry.fetchedAt)))
            return null;
        return { meals: parseSiksha(entry.payload, date), fetchedAt: entry.fetchedAt };
    }
    catch {
        return null;
    }
}
export function writeMenuCache(storage: StorageLike, date: string, payload: unknown, fetchedAt: string) {
    try {
        let cache: Cache = {};
        try {
            const input = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
            if (input && typeof input === 'object' && !Array.isArray(input))
                cache = input;
        }
        catch { }
        cache[date] = { payload, fetchedAt };
        const recent = Object.entries(cache).sort((a, b) => String(b[1]?.fetchedAt).localeCompare(String(a[1]?.fetchedAt))).slice(0, 7);
        storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(recent)));
    }
    catch { /* Public-menu caching must not interrupt browsing or personal records. */ }
}
export { CACHE_KEY };
