// 活動指南頁面清單：與 supabase/migrations/20261124000000_guide_pages.sql 預先建立的列一致，新增頁面時兩邊都要改

export const GUIDE_PAGES = [
  { id: 'venue', title: '場地配置', eyebrow: 'Venue' },
  { id: 'schedule', title: '當天活動流程', eyebrow: 'Schedule' },
  { id: 'uniforms', title: '隊服顏色對照', eyebrow: 'Uniforms' },
  { id: 'meals', title: '餐食內容', eyebrow: 'Meals' },
  { id: 'transport', title: '交通規劃', eyebrow: 'Transport' },
] as const;

export type GuidePageId = (typeof GUIDE_PAGES)[number]['id'];

export const guidePageOf = (id: string) => GUIDE_PAGES.find((p) => p.id === id);
