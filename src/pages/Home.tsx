import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { Badge, ErrorBox, Eyebrow, Loading, StatusTag } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { registrationOpen, sortEvents, teamSizeLabel } from '../lib/rules';
import { CATEGORY_LABEL, type SportEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const STEPS: [string, string][] = [
  ['取得邀請碼', '活動小組提供各公司專屬邀請碼與可自組隊數；小公司可合組聯隊。'],
  ['註冊並綁定公司', '公司窗口以 Email 註冊，輸入邀請碼綁定所屬公司。'],
  ['建立隊伍與名單', '建立隊伍、填寫隊員資料，可從 Excel 直接複製貼上。'],
  ['安排各項目選手', '為趣味競賽與健力比賽指派選手，系統即時檢核人數規則。'],
  ['截止前確認完成', '所有隊伍顯示「已完成」即報名完成，截止後資料將鎖定。'],
];

const pad2 = (n: number) => String(n).padStart(2, '0');

function shortDate(iso: string | null): string {
  if (!iso) return '待公告';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** 以 CSS 自訂屬性傳入比例（長條圖高度 / 寬度） */
const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

function FunCard({ event, index }: { event: SportEvent; index: number }) {
  return (
    <article className="bento-card">
      <div className="bento-top">
        <Badge tone="primary">{CATEGORY_LABEL[event.category]}</Badge>
        <code className="bento-index">{pad2(index)}</code>
      </div>
      <h3>{event.name}</h3>
      <p className="muted small">{event.description}</p>
      <div className="chips">
        <span className="chip">{teamSizeLabel(event)}</span>
        {event.min_female > 0 && <span className="chip">女性至少 {event.min_female} 人</span>}
      </div>
    </article>
  );
}

/** 強調卡：實心萊姆底（健力比賽） */
function AccentCard({ event, index }: { event: SportEvent; index: number }) {
  return (
    <article className="bento-card bento-accent bento-wide">
      <div className="bento-top">
        <Badge>{CATEGORY_LABEL[event.category]}</Badge>
        <code className="bento-index">{pad2(index)} / POWER</code>
      </div>
      <h3>{event.name}</h3>
      <p>{event.description}</p>
      <div className="chips">
        <span className="chip">{teamSizeLabel(event)}</span>
        {event.min_female > 0 && <span className="chip">女性至少 {event.min_female} 人</span>}
      </div>
    </article>
  );
}

/** 對比區右側的灰階六角圖形 */
function HexOrb() {
  return (
    <div className="orb" aria-hidden>
      <svg viewBox="0 0 200 200" fill="none" stroke="#000" strokeWidth="1.2">
        <path d="M100 18 171 59v82l-71 41-71-41V59z" />
        <path d="M100 46 147 73v54l-47 27-47-27V73z" opacity="0.6" />
        <path d="M100 74 123 87v26l-23 13-23-13V87z" fill="#000" />
        <circle cx="171" cy="59" r="5" fill="#ccff00" stroke="none" />
      </svg>
    </div>
  );
}

export default function Home() {
  const { session } = useAuth();
  const q = useAsync(async () => {
    const [settings, events] = await Promise.all([api.getSettings(), api.listEvents()]);
    return { settings, events };
  }, []);

  if (!q.data) {
    return (
      <div className="home-section" style={{ paddingTop: '3rem' }}>
        {q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />}
      </div>
    );
  }

  const { settings, events } = q.data;
  const open = registrationOpen(settings);
  const sorted = sortEvents(events);
  const fun = sorted.filter((e) => e.category === 'fun');
  const power = sorted.filter((e) => e.category === 'powerlifting');
  const maxSlots = Math.max(1, ...sorted.map((e) => e.max_per_team));
  const totalSlots = sorted.reduce((s, e) => s + e.max_per_team, 0);
  const minPeople = Math.ceil(totalSlots / settings.max_events_per_member);
  const year = settings.event_date?.slice(0, 4);
  const cta = homePathFor(session);

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="home-section hero">
        <div className="hero-copy">
          <StatusTag off={!open}>{open ? 'Registration open' : 'Registration closed'}</StatusTag>
          <h1 className="hero-title">
            <span className="hero-title-main">{settings.event_title}</span>
            <em className="hero-title-accent">Sport Day{year ? ` ${year}` : ''}</em>
          </h1>
          <dl className="hero-meta">
            <div>
              <dt>Date</dt>
              <dd>{formatDate(settings.event_date) ?? '待公告'}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{settings.venue ?? '待公告'}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>{formatDateTime(settings.registration_deadline) ?? '待公告'}</dd>
            </div>
          </dl>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to={cta}>
              {session ? '前往填報' : '單位窗口登入'} →
            </Link>
            <button
              className="btn btn-lg"
              onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}
            >
              查看比賽項目
            </button>
          </div>
        </div>

        <div className="hero-visual" aria-hidden>
          <div className="mock glass">
            <div className="mock-bar">
              <i />
              <i />
              <i />
              <code>registration.live</code>
            </div>
            <div className="mock-big">
              <b>{settings.total_team_target}</b>
              <span>TEAMS</span>
            </div>
            <ul className="mock-rows">
              {sorted.map((ev) => (
                <li key={ev.id}>
                  <span>{ev.name}</span>
                  <div className="mock-track">
                    <i style={cssVar('--w', `${(ev.max_per_team / maxSlots) * 100}%`)} />
                  </div>
                  <code>{ev.max_per_team}</code>
                </li>
              ))}
            </ul>
          </div>
          <div className="float-card glass float-a">
            <code>Team size</code>
            <b>
              {settings.team_min_size}–{settings.team_max_size}
            </b>
            <span>人 / 隊</span>
          </div>
          <div className="float-card glass float-b">
            <code>Events</code>
            <b>{events.length}</b>
            <span>
              {fun.length} 趣味 · {power.length} 健力
            </span>
          </div>
          <div className="cursor-tag">
            <svg viewBox="0 0 24 24" fill="#ccff00">
              <path d="M4 2.5 20 11l-7.2 1.8L9.6 20z" />
            </svg>
            <span>{open ? '報名開放中' : '報名已截止'}</span>
          </div>
        </div>
      </section>

      {/* ---- Bento：比賽項目 ---- */}
      <section id="events" className="home-section">
        <div className="section-head">
          <div>
            <Eyebrow>01 / Events</Eyebrow>
            <h2>比賽項目</h2>
          </div>
          <p className="muted">人數規則由活動小組設定，系統會即時檢核每隊的報名狀態。</p>
        </div>
        <div className="bento">
          <article className="bento-card bento-large">
            <code className="bento-index">SLOTS PER TEAM</code>
            <div className="bento-big">
              {totalSlots}
              <span>個名額 / 隊</span>
            </div>
            <p className="muted">
              每人最多報名 {settings.max_events_per_member} 項，每隊至少需要 {minPeople} 人才能填滿所有項目。
            </p>
            <div className="bars">
              {sorted.map((ev) => (
                <div key={ev.id} className={`bar ${ev.category === 'powerlifting' ? 'bar-pl' : ''}`}>
                  <code>{ev.max_per_team}</code>
                  <span className="bar-fill" style={cssVar('--h', `${(ev.max_per_team / maxSlots) * 100}%`)} />
                  <label>{ev.name}</label>
                </div>
              ))}
            </div>
          </article>

          <article className="bento-card bento-tall">
            <code className="bento-index">RULES</code>
            <h3>報名規則</h3>
            <p className="muted small">由活動小組設定。超過上限的資料無法送出，未達下限會標示「未完成」提醒補齊。</p>
            <ul className="swatches">
              <li>
                <i className="sw sw-lime" />
                <div>
                  <b>
                    {settings.team_min_size}–{settings.team_max_size} 人
                  </b>
                  <code>TEAM SIZE</code>
                </div>
              </li>
              <li>
                <i className="sw sw-emerald" />
                <div>
                  <b>最多 {settings.max_events_per_member} 項</b>
                  <code>PER MEMBER</code>
                </div>
              </li>
              <li>
                <i className="sw sw-white" />
                <div>
                  <b>{settings.total_team_target} 隊</b>
                  <code>TEAMS</code>
                </div>
              </li>
              <li>
                <i className="sw sw-grey" />
                <div>
                  <b>{shortDate(settings.registration_deadline)}</b>
                  <code>DEADLINE</code>
                </div>
              </li>
            </ul>
          </article>

          {fun.map((ev, i) => (
            <FunCard key={ev.id} event={ev} index={i + 1} />
          ))}
          {power.map((ev, i) => (
            <AccentCard key={ev.id} event={ev} index={fun.length + i + 1} />
          ))}
        </div>
      </section>

      {/* ---- 對比區：報名流程 ---- */}
      <section className="contrast">
        <div className="contrast-inner">
          <div>
            <Eyebrow>02 / How it works</Eyebrow>
            <h2>報名流程</h2>
            <ol className="steps">
              {STEPS.map(([title, body], i) => (
                <li key={title}>
                  <span className="step-no">{pad2(i + 1)}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="contrast-visual">
            <HexOrb />
            <div className="glass-note">
              <code>PRIVACY</code>
              <p>身分證字號、生日等個資僅所屬公司窗口與活動小組可檢視，只用於報名、保險、餐點與場地安排，活動結束後全數刪除。</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
