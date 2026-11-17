import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 使用相對路徑 + 前端採 HashRouter，部署到 GitHub Pages 任何 repo 名稱下都不需改設定
export default defineConfig({
  base: './',
  plugins: [react()],
});
