import { createDemoApi } from './demo';
import { createSupabaseApi } from './supabase';
import type { DataApi } from './types';

export type { DataApi, SessionInfo } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** 全站唯一的資料存取入口；未設定 Supabase 環境變數時自動進入展示模式 */
export const api: DataApi = url && key ? createSupabaseApi(url, key) : createDemoApi();
