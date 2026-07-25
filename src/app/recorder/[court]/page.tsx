'use client';

// コート専用の記録係ページ（/recorder/a 〜 /recorder/d）
// メインページと同じコンポーネントを使用（URLでロール・コートを判定）
import dynamic from 'next/dynamic';

const Home = dynamic(() => import('../../page'), { ssr: false });

export default function RecorderCourtPage() {
  return <Home />;
}
