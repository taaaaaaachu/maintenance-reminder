import { useState } from "react";
import type { NotificationChannel, NotificationSetting } from "@maintenance-reminder/shared";

interface ChannelFieldDef {
  key: string;
  label: string;
  type?: string;
}

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  line: "LINE",
  email: "メール",
  pushover: "Pushover",
};

const CHANNEL_FIELDS: Record<NotificationChannel, ChannelFieldDef[]> = {
  line: [{ key: "userId", label: "LINE User ID" }],
  email: [{ key: "toAddress", label: "送信先メールアドレス", type: "email" }],
  pushover: [{ key: "userKey", label: "Pushover User Key" }],
};

interface NotificationChannelCardProps {
  setting: NotificationSetting;
  onSave: (isEnabled: boolean, config: Record<string, string>) => void;
  onTest: () => void;
  isSaving?: boolean;
  isTesting?: boolean;
  testResult?: { ok: boolean; message: string } | null;
}

export function NotificationChannelCard({
  setting,
  onSave,
  onTest,
  isSaving,
  isTesting,
  testResult,
}: NotificationChannelCardProps) {
  const [isEnabled, setIsEnabled] = useState(setting.isEnabled);
  const [config, setConfig] = useState<Record<string, string>>(setting.config);

  const fields = CHANNEL_FIELDS[setting.channel];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{CHANNEL_LABELS[setting.channel]}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          有効化
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="text-slate-600">{field.label}</span>
            <input
              type={field.type ?? "text"}
              value={config[field.key] ?? ""}
              onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(isEnabled, config)}
          disabled={isSaving}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          保存する
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting || !setting.isEnabled}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          テスト送信
        </button>
        {testResult && (
          <span className={`text-sm ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
