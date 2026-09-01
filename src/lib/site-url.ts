const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeSiteOrigin(configured: string): string {
  const value = configured.trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("공개 사이트 URL은 유효한 절대 URL이어야 합니다.");
  }

  const isLocalDevelopment = LOCAL_HOSTNAMES.has(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLocalDevelopment)
  ) {
    throw new Error(
      "공개 사이트 URL은 HTTPS여야 하며 HTTP는 로컬 개발에서만 허용됩니다.",
    );
  }
  if (url.username || url.password) {
    throw new Error("공개 사이트 URL에 인증 정보를 포함할 수 없습니다.");
  }
  if (!/^\/+$/.test(url.pathname) || url.search || url.hash) {
    throw new Error(
      "공개 사이트 URL에는 origin만 설정하고 경로, 쿼리, 해시를 포함하지 마세요.",
    );
  }

  return url.origin;
}

export function getSiteUrl() {
  const configured = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ].find((value): value is string => Boolean(value?.trim()));

  if (!configured) return "http://localhost:3000";
  return normalizeSiteOrigin(configured);
}
