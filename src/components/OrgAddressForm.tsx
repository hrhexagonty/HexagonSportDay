import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { MAX_ADDRESS_LENGTH, MAX_CONTACT_NAME_LENGTH } from '../lib/orgAddress';
import type { OrgAddress, OrgAddressInput } from '../lib/types';
import { useToast } from './Toast';
import { Field } from './ui';

/** 表單欄位（皆為字串；空字串存檔時轉成 null） */
type TextKey = Exclude<keyof OrgAddressInput, 'sample_same'>;
type FormState = Record<TextKey, string> & { sample_same: boolean };

const TEXT_KEYS: TextKey[] = [
  'shuttle_address',
  'shuttle_leader_name',
  'shuttle_leader_phone',
  'sample_address',
  'sample_recipient_name',
  'sample_recipient_phone',
];

const toForm = (a: OrgAddress | null): FormState => ({
  shuttle_address: a?.shuttle_address ?? '',
  shuttle_leader_name: a?.shuttle_leader_name ?? '',
  shuttle_leader_phone: a?.shuttle_leader_phone ?? '',
  sample_address: a?.sample_address ?? '',
  sample_same: a?.sample_same ?? false,
  sample_recipient_name: a?.sample_recipient_name ?? '',
  sample_recipient_phone: a?.sample_recipient_phone ?? '',
});

/**
 * 公司地址與聯絡人表單：接駁車（接送地址、車長姓名 / 電話）、樣衣寄送（地址可勾選「同上」、收件人姓名 / 電話）
 * 用於「我的公司」頁（窗口）與後台「接駁與樣衣」分頁（管理員代填）
 * 呼叫端以 key={address?.updated_at} 掛載：存檔重新載入後以伺服器資料（已去除空白）重新顯示
 */
export function OrgAddressForm({
  orgId,
  address,
  editable,
  onSaved,
  onCancel,
}: {
  orgId: string;
  address: OrgAddress | null;
  editable: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(address));
  const [saving, setSaving] = useState(false);
  const saved = toForm(address);
  const dirty =
    form.sample_same !== saved.sample_same ||
    TEXT_KEYS.some((k) => !(k === 'sample_address' && form.sample_same) && form[k].trim() !== saved[k]);

  const text = (key: TextKey) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
    disabled: !editable,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveOrgAddress(orgId, { ...form, sample_address: form.sample_same ? null : form.sample_address });
      toast.ok('已儲存');
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack address-form" onSubmit={submit}>
      <div className="address-groups">
        <section className="address-group">
          <h3 className="address-group-title">接駁車</h3>
          <Field label="接駁車接送地址" hint="活動當天接駁車到公司接送同仁的地點">
            <input
              {...text('shuttle_address')}
              maxLength={MAX_ADDRESS_LENGTH}
              placeholder="例如：台北市內湖區瑞光路 100 號 1 樓大廳"
            />
          </Field>
          <div className="row-2">
            <Field label="車長姓名">
              <input {...text('shuttle_leader_name')} maxLength={MAX_CONTACT_NAME_LENGTH} autoComplete="off" />
            </Field>
            <Field label="車長電話">
              <input {...text('shuttle_leader_phone')} type="tel" inputMode="tel" maxLength={30} autoComplete="off" />
            </Field>
          </div>
        </section>

        <section className="address-group">
          <h3 className="address-group-title">樣衣寄送</h3>
          <div className="field">
            <div className="address-sample-head">
              <span className="field-label">樣衣寄送地址</span>
              <label className="address-same">
                <input
                  type="checkbox"
                  checked={form.sample_same}
                  onChange={(e) => setForm({ ...form, sample_same: e.target.checked })}
                  disabled={!editable}
                />
                <span>同上</span>
              </label>
            </div>
            <input
              aria-label="樣衣寄送地址"
              value={form.sample_same ? form.shuttle_address : form.sample_address}
              onChange={(e) => setForm({ ...form, sample_address: e.target.value })}
              maxLength={MAX_ADDRESS_LENGTH}
              placeholder={form.sample_same ? '與接駁車接送地址相同' : '樣衣要寄到哪裡'}
              disabled={!editable || form.sample_same}
            />
            <span className="field-hint">{form.sample_same ? '已勾選同上：寄到接駁車接送地址' : '地址不同時請另外填寫'}</span>
          </div>
          <div className="row-2">
            <Field label="樣衣收件人姓名">
              <input {...text('sample_recipient_name')} maxLength={MAX_CONTACT_NAME_LENGTH} autoComplete="off" />
            </Field>
            <Field label="樣衣收件人電話">
              <input {...text('sample_recipient_phone')} type="tel" inputMode="tel" maxLength={30} autoComplete="off" />
            </Field>
          </div>
        </section>
      </div>
      <p className="muted small">
        車長與樣衣收件人的姓名、電話僅提供活動小組與承辦廠商聯絡接駁、寄送樣衣使用，活動結束後清除。
      </p>
      {editable && (
        <div className="actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving || !dirty}>
            {saving ? '儲存中…' : '儲存'}
          </button>
          {onCancel && (
            <button className="btn btn-sm" type="button" onClick={onCancel} disabled={saving}>
              取消
            </button>
          )}
          {dirty && !saving && <span className="muted small">尚未儲存</span>}
        </div>
      )}
    </form>
  );
}
