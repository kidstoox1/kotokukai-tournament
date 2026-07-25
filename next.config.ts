import type { NextConfig } from "next";

// ビルド時刻をバージョン識別子として使う。
// クライアントに埋め込まれた値と /api/version が返す値は同一ビルドなら一致し、
// 新しいデプロイが公開されると /api/version 側だけ新しくなるため更新を検知できる。
const buildVersion = Date.now().toString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

export default nextConfig;
