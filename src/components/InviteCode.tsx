import { useState, type FormEvent } from 'react';
import { api, type InviteInfo } from '../lib/api';
import { normalizeInviteCode } from '../lib/inviteCode';
import { Field } from './ui';

/** 展示模式提示：可用來體驗註冊的邀請碼 */
export const DEMO_INVITE_HINT =
  '展示模式邀請碼：六角科技 獵豹隊 TECH03、六角建設 鋼鐵隊 BUIL04、醫材能源文創 聯隊 MEDI09 / ARTS09、委外廠商 VENDOR01';

/**
 * 第一步：輸入邀請碼，正確才回傳對應的隊伍與公司，或委外廠商（名額已滿則擋下）
 * teamOnly：只接受隊伍邀請碼（已登入的窗口加入其他隊伍）
 */
export function InviteCodeForm({
  onFound,
  teamOnly = false,
}: {
  onFound: (info: InviteInfo, code: string) => void;
  teamOnly?: boolean;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const info = await api.lookupInvite(code);
      if (info.kind === 'vendor' && teamOnly) {
        setError('這是委外廠商的邀請碼，請登出後於「首次註冊」以另一個信箱註冊');
        return;
      }
      if (info.isFull) {
        setError(
          info.kind === 'vendor'
            ? `「${info.vendorName}」的帳號名額已滿，請洽活動小組`
            : `「${info.teamName}」的窗口名額已滿，請洽活動小組`,
        );
        return;
      }
      onFound(info, normalizeInviteCode(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="邀請碼" hint="請輸入活動小組派發的邀請碼；聯隊中各公司的邀請碼不同，請使用貴公司的那一組">
        <input
          required
          autoFocus
          className="input-code"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(normalizeInviteCode(e.target.value));
            setError(null);
          }}
          placeholder="例如 A1B2C3D4"
        />
      </Field>
      {error && <div className="notice notice-err">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || !code}>
        {busy ? '確認中…' : '下一步'}
      </button>
      {api.mode === 'demo' && <p className="muted small">{DEMO_INVITE_HINT}</p>}
    </form>
  );
}

/** 邀請碼已確認：顯示邀請碼與「更換」按鈕 */
export function InviteCodeOk({ code, onReset }: { code: string; onReset: () => void }) {
  return (
    <div className="invite-ok">
      <code className="code-pill">{code}</code>
      <span className="ok-text small">✓ 邀請碼正確</span>
      <button type="button" className="btn btn-xs btn-ghost" onClick={onReset}>
        更換邀請碼
      </button>
    </div>
  );
}

/** 邀請碼對應的隊伍與公司，或委外廠商 */
export function InviteTeamCard({ info }: { info: InviteInfo }) {
  if (info.kind === 'vendor') {
    return (
      <div className="invite-team">
        <span>VENDOR</span>
        <b>{info.vendorName}</b>
        <p className="muted small">
          你將以「委外廠商」身分註冊：可檢視填報總覽、各隊隊員與項目報名、隊伍配置、健力報名（隊員證號、生日、手機為隱碼），並可編輯活動設定（含活動指南）與競賽項目設定。
        </p>
      </div>
    );
  }
  return (
    <div className="invite-team">
      <span>TEAM</span>
      <b>{info.teamName}</b>
      <p className="muted small">你將以「{info.orgName}」窗口的身分加入，可填寫與檢視該公司隊員的資料。</p>
    </div>
  );
}
