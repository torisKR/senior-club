import { ProfilePanel } from "@/components/profile-panel";
import { requireServerUser } from "@/lib/auth/server";

export default async function MyPage() {
  const user = await requireServerUser("/me");
  return (
    <div className="bg-[var(--canvas)] px-5 py-8 text-[var(--ink)] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-[18px] font-extrabold text-[var(--primary-strong)]">
            나의 시니어클럽
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            마이페이지
          </h1>
          <p className="mt-4 text-[19px] leading-8 text-[var(--muted)]">
            내 관심사와 활동 소식을 한눈에 확인하세요.
          </p>
        </div>
        <ProfilePanel initialUser={user} />
      </div>
    </div>
  );
}
