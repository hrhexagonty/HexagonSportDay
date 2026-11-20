// 活動指南頁面（場地配置、當天活動流程、隊服顏色對照、餐食內容、交通規劃）：登入者可讀
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { RichContent } from '../components/RichText';
import { EmptyState, ErrorBox, Eyebrow, Loading } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { GUIDE_PAGES, guidePageOf } from '../lib/guide';
import { useAsync } from '../lib/useAsync';

export default function Guide() {
  const { pageId = '' } = useParams();
  const meta = guidePageOf(pageId);
  const q = useAsync(() => (meta ? api.getGuidePage(meta.id) : Promise.resolve(null)), [pageId]);
  if (!meta) return <Navigate to={`/guide/${GUIDE_PAGES[0].id}`} replace />;

  const page = q.data;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>{meta.eyebrow}</Eyebrow>
          <h1>{meta.title}</h1>
          <p className="muted">
            {page?.updated_at ? `活動小組最後更新：${formatDateTime(page.updated_at)}` : '內容由活動小組公布與更新。'}
          </p>
        </div>
      </div>
      <nav className="chips guide-jump" aria-label="活動指南">
        {GUIDE_PAGES.map((g) => (
          <NavLink key={g.id} to={`/guide/${g.id}`} className={({ isActive }) => `chip${isActive ? ' chip-active' : ''}`}>
            {g.title}
          </NavLink>
        ))}
      </nav>
      {q.data === undefined ? (
        q.error ? (
          <ErrorBox message={q.error} onRetry={q.reload} />
        ) : (
          <Loading />
        )
      ) : page?.content ? (
        <section className="card guide-card">
          <RichContent html={page.content} />
        </section>
      ) : (
        <EmptyState title={`${meta.title}尚未公布`}>活動小組公布後會顯示在這裡，請稍後再查看。</EmptyState>
      )}
    </div>
  );
}
