// 現在デプロイされているビルドのバージョンを返す。
// クライアントは自分に埋め込まれた NEXT_PUBLIC_BUILD_VERSION と比較し、
// 異なっていれば「新しいバージョンが公開された」と判断する。

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_BUILD_VERSION || null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
