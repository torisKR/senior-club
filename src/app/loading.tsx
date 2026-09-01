export default function Loading() {
  return (
    <div className="page-container page-content" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-3xl py-16 text-center">
        <span className="mx-auto block h-12 w-12 animate-pulse rounded-full bg-[var(--sky)]" aria-hidden="true" />
        <h1 className="section-title mt-5">내용을 준비하고 있어요</h1>
        <p className="mt-2 text-[var(--muted)]">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}
