import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Badge, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull, fromLocalInput, toLocalInput } from '../../lib/format';
import { isCompanyEvent, registrationOpen, sortEvents } from '../../lib/rules';
import { CATEGORY_LABEL, type SportEvent } from '../../lib/types';
import { isValidVideoUrl } from '../../lib/video';
import type { AdminData } from './types';

function SettingsForm({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { settings } = data;
  const toast = useToast();
  const [f, setF] = useState({
    title: settings.event_title,
    date: settings.event_date ?? '',
    venue: settings.venue ?? '',
    open: settings.registration_open,
    deadline: toLocalInput(settings.registration_deadline),
    target: String(settings.total_team_target),
    min: String(settings.team_min_size),
    max: String(settings.team_max_size),
    perMember: String(settings.max_events_per_member),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const min = Number(f.min);
    const max = Number(f.max);
    if (max < min) {
      toast.error('每隊人數上限不可小於下限');
      return;
    }
    try {
      await api.updateSettings({
        event_title: f.title.trim(),
        event_date: f.date || null,
        venue: blankToNull(f.venue),
        registration_open: f.open,
        registration_deadline: fromLocalInput(f.deadline),
        total_team_target: Number(f.target),
        team_min_size: min,
        team_max_size: max,
        max_events_per_member: Number(f.perMember),
      });
      toast.ok('活動設定已儲存');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  const open = registrationOpen(settings);

  return (
    <form className="card stack" onSubmit={save}>
      <div className="title-row">
        <h2>活動設定</h2>
        <Badge tone={open ? 'ok' : 'err'}>目前{open ? '開放報名' : '已截止'}</Badge>
      </div>
      <div className="row-3">
        <Field label="活動名稱">
          <input required value={f.title} onChange={set('title')} />
        </Field>
        <Field label="活動日期">
          <input type="date" value={f.date} onChange={set('date')} />
        </Field>
        <Field label="地點">
          <input value={f.venue} onChange={set('venue')} />
        </Field>
      </div>
      <div className="row-3">
        <Field label="報名開關" hint="關閉後，單位窗口無法再修改資料（管理員仍可修改）">
          <label className="switch">
            <input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} />
            <span>{f.open ? '開放中' : '已關閉'}</span>
          </label>
        </Field>
        <Field label="報名截止時間" hint="時間到自動鎖定；留空表示不限">
          <input type="datetime-local" value={f.deadline} onChange={set('deadline')} />
        </Field>
        <Field label="目標隊伍數">
          <input type="number" min={1} required value={f.target} onChange={set('target')} />
        </Field>
      </div>
      <div className="row-3">
        <Field label="每隊人數下限">
          <input type="number" min={0} required value={f.min} onChange={set('min')} />
        </Field>
        <Field label="每隊人數上限">
          <input type="number" min={1} required value={f.max} onChange={set('max')} />
        </Field>
        <Field label="每人最多報名項目數">
          <input type="number" min={1} required value={f.perMember} onChange={set('perMember')} />
        </Field>
      </div>
      <div className="actions">
        <button className="btn btn-primary">儲存活動設定</button>
      </div>
    </form>
  );
}

function EventRow({ event, onChanged }: { event: SportEvent; onChanged: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: event.name,
    description: event.description,
    min: String(event.min_per_team),
    max: String(event.max_per_team),
    female: String(event.min_female),
    rules: event.rules,
    video: event.video_url,
  });
  const dirty =
    f.name !== event.name ||
    f.description !== event.description ||
    Number(f.min) !== event.min_per_team ||
    Number(f.max) !== event.max_per_team ||
    Number(f.female) !== event.min_female ||
    f.rules !== event.rules ||
    f.video !== event.video_url;

  async function save(e: FormEvent) {
    e.preventDefault();
    const min = Number(f.min);
    const max = Number(f.max);
    if (max < min) {
      toast.error('人數上限不可小於下限');
      return;
    }
    const video = f.video.trim();
    if (!isValidVideoUrl(video)) {
      toast.error('影片連結需以 http:// 或 https:// 開頭');
      return;
    }
    try {
      await api.updateEvent(event.id, {
        name: f.name.trim(),
        description: f.description.trim(),
        min_per_team: min,
        max_per_team: max,
        min_female: Number(f.female),
        rules: f.rules.trim(),
        video_url: video,
      });
      toast.ok(`「${f.name}」已更新`);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <form className="event-row" onSubmit={save}>
      <div className="event-row-main">
        <Badge tone={event.category === 'powerlifting' ? 'accent' : 'primary'}>{CATEGORY_LABEL[event.category]}</Badge>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="項目名稱" />
        <input
          className="grow"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          aria-label="說明"
          placeholder="項目說明"
        />
      </div>
      <div className="event-row-nums">
        <Field label="每隊下限">
          <input type="number" min={0} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </Field>
        <Field label="每隊上限">
          <input type="number" min={1} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </Field>
        <Field label="女性至少">
          <input type="number" min={0} value={f.female} onChange={(e) => setF({ ...f, female: e.target.value })} />
        </Field>
        {isCompanyEvent(event) && <span className="muted small">以公司為單位組隊：「每隊」指每支公司隊伍</span>}
      </div>
      <div className="event-row-rules">
        <Field label="競賽規則" hint="顯示於前台「競賽規則」，保留換行">
          <textarea
            rows={4}
            value={f.rules}
            onChange={(e) => setF({ ...f, rules: e.target.value })}
            placeholder={'1. 比賽方式…\n2. 計分方式…'}
          />
        </Field>
        <Field label="示範影片連結" hint="YouTube 連結會直接內嵌播放；其他連結（例如雲端硬碟）以新分頁開啟">
          <input
            type="url"
            value={f.video}
            onChange={(e) => setF({ ...f, video: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </Field>
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={!dirty}>
          儲存
        </button>
      </div>
    </form>
  );
}

export default function SettingsEditor({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  return (
    <div className="stack-lg">
      <SettingsForm data={data} onChanged={onChanged} />
      <section className="card stack">
        <div>
          <h2>比賽項目、競賽規則與示範影片</h2>
          <p className="muted small">
            每隊下限 = 上限 代表固定人數；下限為 0 代表選填項目。修改後所有隊伍的檢核結果會立即更新；競賽規則與示範影片會顯示在前台「競賽規則」。
          </p>
        </div>
        {sortEvents(data.events).map((ev) => (
          <EventRow key={`${ev.id}-${JSON.stringify(ev)}`} event={ev} onChanged={onChanged} />
        ))}
      </section>
    </div>
  );
}
