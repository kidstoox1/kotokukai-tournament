'use client';

// 観覧専用ページ — メインページと同じコンポーネントを使用（URLでロール判定）
import dynamic from 'next/dynamic';

const Home = dynamic(() => import('../page'), { ssr: false });

export default function ViewerPage() {
  return <Home />;
}
