import { Badge, ErrorBox, Eyebrow, Loading } from '../components/ui';
import { api } from '../lib/api';
import { isCompanyEvent, sortEvents, teamSizeLabel } from '../lib/rules';
import { CATEGORY_LABEL, type SportEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { isValidVideoUrl, youTubeEmbedUrl } from '../lib/video';

/** 示範影片：YouTube 直接內嵌，其他連結開新分頁 */
function Video({ event }: { event: SportEvent }) {
  const url = event.video_url;
  if (!url || !isValidVideoUrl(url)) return null;
  const embed = youTubeEmbedUrl(url);
  if (embed) {
    return (
      <div className="rule-video">
        <iframe
          src={embed}
          title={`${event.name} 示範影片`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <a className="btn rule-video-link" href={url} target="_blank" rel="noopener noreferrer">
      ▶ 觀看示範影片 <span aria-hidden>↗</span>
    </a>
  );
}

function RuleCard({ event, no }: { event: SportEvent; no: number }) {
  const company = isCompanyEvent(event);
  const hasVideo = !!event.video_url && isValidVideoUrl(event.video_url);
  return (
    <section id={`rule-${event.id}`} className={`card rule-card ${company ? 'rule-card-accent' : ''} ${hasVideo ? 'has-video' : ''}`}>
      <div className="rule-body">
        <div className="rule-head">
          <span className="rule-no">{String(no).padStart(2, '0')}</span>
          <div>
            <div className="title-row">
              <h2>{event.name}</h2>
              <Badge tone={company ? 'accent' : 'primary'}>{CATEGORY_LABEL[event.category]}</Badge>
            </div>
            <p className="muted small">
              {company ? `以公司為單位組隊 · ${teamSizeLabel(event)}` : teamSizeLabel(event)}
              {event.min_female > 0 && ` · 女性至少 ${event.min_female} 人`}
            </p>
          </div>
        </div>
        {event.description && <p className="rule-desc">{event.description}</p>}
        {event.rules ? <div className="rule-text">{event.rules}</div> : <p className="muted small">規則尚未公布，請留意活動小組更新。</p>}
      </div>
      {hasVideo && <Video event={event} />}
    </section>
  );
}

export default function Rules() {
  const q = useAsync(() => api.listEvents(), []);
  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const events = sortEvents(q.data);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>Rules</Eyebrow>
          <h1>競賽規則</h1>
          <p className="muted">各項目的規則說明與示範影片，內容由活動小組公布與更新。</p>
        </div>
      </div>
      <div className="chips rule-jump">
        {events.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className="chip"
            onClick={() => document.getElementById(`rule-${ev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {ev.name}
          </button>
        ))}
      </div>
      {events.map((ev, i) => (
        <RuleCard key={ev.id} event={ev} no={i + 1} />
      ))}
    </div>
  );
}
