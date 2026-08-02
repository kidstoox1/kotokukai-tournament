'use client';

// ==========================================
// 簡易アクセスゲート（運営ページ用）
// ==========================================
// 管理・記録係の本番ページを開くときに合言葉の入力を求める。
// 目的は「関係者以外がURLを踏んでも運営画面に入れない」ようにすること。
// 本格的な認証ではなく、誤操作・URL流出時の抑止が目的。
// 観覧(/viewer)とデモ(/demo)は広く配布するため対象外。
// 一度入力すればその端末では記憶される（localStorage）。

import { useState, useEffect } from 'react';

const PASSPHRASE = 'koutoku';
const STORAGE_KEY = 'kotokukai-access';

export function AccessGate({ children }: { children: React.ReactNode }) {
  // 'checking' の間は何も描画しない（未認証画面のチラつき防止）
  const [status, setStatus] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const ok = localStorage.getItem(STORAGE_KEY) === PASSPHRASE;
      setStatus(ok ? 'unlocked' : 'locked');
    } catch {
      setStatus('locked');
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim().toLowerCase() === PASSPHRASE) {
      try {
        localStorage.setItem(STORAGE_KEY, PASSPHRASE);
      } catch {
        // プライベートモード等で保存できなくても、このセッションでは通す
      }
      setStatus('unlocked');
    } else {
      setError(true);
      setInput('');
    }
  };

  if (status === 'checking') {
    return <div className="min-h-screen bg-[#0B1120]" />;
  }

  if (status === 'unlocked') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl p-7 text-center"
        style={{ background: '#161E2E', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="text-xl font-extrabold text-white mb-1">日本拳法 孝徳会</div>
        <div className="text-sm text-gray-400 mb-6">大会運営システム</div>

        <div className="text-[11px] text-gray-400 mb-2 text-left">
          運営ページです。合言葉を入力してください
        </div>
        <input
          type="password"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(false); }}
          autoFocus
          autoComplete="off"
          className="w-full px-3 py-3 rounded-lg text-white text-base text-center tracking-widest"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${error ? '#EF4444' : 'rgba(255,255,255,0.15)'}`,
            outline: 'none',
          }}
        />
        {error && (
          <div className="text-[11px] text-red-400 mt-2">合言葉が違います</div>
        )}

        <button
          type="submit"
          className="w-full mt-5 py-3 rounded-lg text-white text-sm font-bold border-none cursor-pointer"
          style={{ background: '#B91C1C' }}
        >
          入る
        </button>

        <div className="text-[10px] text-gray-500 mt-5 leading-relaxed">
          試合結果をご覧になりたい方は{' '}
          <a href="/viewer" className="text-blue-400 underline">観覧ページ</a>
          へ（合言葉不要）
        </div>
      </form>
    </div>
  );
}
