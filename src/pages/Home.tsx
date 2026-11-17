import { Link } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { Badge, ErrorBox, Loading } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { registrationOpen, sortEvents, teamSizeLabel } from '../lib/rules';
import { CATEGORY_LABEL, type SportEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const STEPS = [
  ['取得邀請碼', '活動小組會提供各單位專屬邀請碼與可報名隊數。'],
  ['註冊並綁定單位', '單位窗口以 Email 註冊，輸入邀請碼綁定所屬單位。'],
  ['建立隊伍與名單', '建立隊伍、填寫隊員，可從 Excel 直接複製貼上。'],
  ['安排各項目選手', '為趣味競賽與健力比賽指派選手，系統即時檢核人數規則。'],
  ['截止前確認完成', '所有隊伍顯示「已完成」即報名完成，截止後將鎖定資料。'],
];

function EventCard({ event }: { event: SportEvent }) {
  const pl = event.category === 'powerlifting';
  return (
    <article className={`event-card ${pl ? 'event-card-pl' : ''}`}>
      <Badge tone={pl ? 'accent' : 'primary'}>{CATEGORY_LABEL[event.category]}</Badge>
      <h3>{event.name}</h3>
      <p className="muted">{event.description}</p>
      <div className="chips">
        <span className="chip">{teamSizeLabel(event)}</span>
        {event.min_female > 0 && <span className="chip">女性至少 {event.min_female} 人</span>}
      </div>
    </article>
  );
}

export default function Home() {
  const { session } = useAuth();
  const q = useAsync(async () => {
    const [settings, events] = await Promise.all([api.getSettings(), api.listEvents()]);
    return { settings, events };
  }, []);

  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const { settings, events } = q.data;
  const open = registrationOpen(settings);
  const sorted = sortEvents(events);
  const funCount = events.filter((e) => e.category === 'fun').length;
  const plCount = events.length - funCount;

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <Badge tone={open ? 'ok' : 'err'}>{open ? '報名開放中' : '報名已截止'}</Badge>
          <h1>{settings.event_title}</h1>
          <p className="hero-meta">
            <span>日期：{formatDate(settings.event_date) ?? '待公告'}</span>
            <span>地點：{settings.venue ?? '待公告'}</span>
          </p>
          {settings.registration_deadline && (
            <p className="hero-deadline">報名截止：{formatDateTime(settings.registration_deadline)}</p>
          )}
          <div className="hero-actions">
            <Link className="btn btn-lg btn-accent" to={homePathFor(session)}>
              {session ? '前往填報' : '單位窗口登入'}
            </Link>
            <button
              className="btn btn-lg btn-onhero"
              onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}
            >
              查看比賽項目
            </button>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <b>{settings.total_team_target}</b>
            <span>參賽隊伍</span>
          </div>
          <div>
            <b>
              {settings.team_min_size}–{settings.team_max_size}
            </b>
            <span>每隊人數</span>
          </div>
          <div>
            <b>{funCount}</b>
            <span>趣味競賽</span>
          </div>
          <div>
            <b>{plCount}</b>
            <span>健力比賽</span>
          </div>
        </div>
      </section>

      <section id="events" className="section">
        <div className="section-head">
          <h2>比賽項目</h2>
          <p className="muted">每人最多報名 {settings.max_events_per_member} 個項目；人數規則由活動小組設定。</p>
        </div>
        <div className="grid grid-events">
          {sorted.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>報名流程</h2>
        </div>
        <ol className="steps">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="step-no">{i + 1}</span>
              <div>
                <strong>{title}</strong>
                <p className="muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
