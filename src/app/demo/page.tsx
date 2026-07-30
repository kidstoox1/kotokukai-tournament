'use client';

// デモ版ページ（コーポレートサイト掲載用）
// - クラウド同期なし: データは閲覧者の端末(localStorage)にのみ保存
// - サンプルデータを自動読込
// - 本番の大会データには一切影響しない
import dynamic from 'next/dynamic';

const Home = dynamic(() => import('../page'), { ssr: false });

export default function DemoPage() {
  return <Home />;
}
