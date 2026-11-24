import { ALLERGY_OPTIONS, CATEGORY_OPTIONS, type LocalData, type MealRecord, type SavedUpload } from './meal-model.ts';
import { isDateString } from './meal-utils.ts';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const oldExampleIds = new Set(['beef', 'rice', 'pork', 'greens', 'pasta', 'salad', 'garlic', 'curry', 'egg', 'pickles']);
export function sanitizeOverrides(value: unknown): Record<string, number> {
    if (!object(value))
        return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [
        string,
        number
    ] => isDateString(entry[0].slice(0, 10)) && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 1 && entry[1] <= 5000));
}
export function sanitizeLocalData(value: unknown): LocalData | null {
    if (!object(value) || value.version !== 1)
        return null;
    const recordsByDate: Record<string, MealRecord[]> = {};
    if (object(value.recordsByDate))
        for (const [date, records] of Object.entries(value.recordsByDate)) {
            if (!isDateString(date) || !Array.isArray(records))
                continue;
            recordsByDate[date] = records.filter(item => object(item) && text(item.id) && text(item.name) && text(item.cafeteria)).map(item => {
                const example = item.example === true || oldExampleIds.has(item.id);
                return { id: item.id, name: item.name, cafeteria: item.cafeteria, category: text(item.category) ? item.category : '기타',
                    kcal: typeof item.kcal === 'number' && Number.isFinite(item.kcal) && item.kcal >= 0 && item.kcal <= 5000 ? item.kcal : null,
                    confirmed: !example && item.confirmed === true, ...(example ? { example: true } : {}) };
            });
        }
    const votes: LocalData['votes'] = object(value.votes) ? Object.fromEntries(Object.entries(value.votes).filter((entry): entry is [
        string,
        'like' | 'dislike'
    ] => ['like', 'dislike'].includes(String(entry[1])))) : {};
    const uploads = Array.isArray(value.uploads) ? value.uploads.filter(item => object(item) && text(item.id) && item.id.startsWith('upload-') && isDateString(item.date) && text(item.cafeteria) && ['조식', '중식', '석식'].includes(String(item.time)) && Array.isArray(item.menu) && item.menu.every((menu: unknown) => object(menu) && text(menu.id) && text(menu.name) && text(menu.category) && Array.isArray(menu.tags) && menu.tags.every(text))).slice(0, 50) as SavedUpload[] : [];
    const options = (input: unknown, allowed: string[]) => Array.isArray(input) ? input.filter((item): item is string => text(item) && allowed.includes(item)) : [];
    return { version: 1, recordsByDate, votes, uploads,
        target: ['다이어트', '유지', '벌크업', '직접 설정'].includes(String(value.target)) ? String(value.target) : '유지',
        targetKcal: typeof value.targetKcal === 'number' && Number.isFinite(value.targetKcal) && value.targetKcal >= 500 && value.targetKcal <= 5000 ? Math.round(value.targetKcal) : 2000,
        preferredCategories: options(value.preferredCategories, CATEGORY_OPTIONS), allergies: options(value.allergies, ALLERGY_OPTIONS), dislikedIngredients: text(value.dislikedIngredients) ? value.dislikedIngredients : '' };
}
export function summarizeRecords(records: MealRecord[]) {
    const confirmed = records.filter(item => item.confirmed === true && !item.example);
    return { count: confirmed.length, total: confirmed.reduce((sum, item) => sum + (item.kcal ?? 0), 0), unknown: confirmed.filter(item => item.kcal === null).length };
}
export function canRecordMeal(date: string, today: string, id: string) {
    return isDateString(date) && date <= today && /^(siksha-|custom-)/.test(id);
}
