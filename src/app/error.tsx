"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-container page-content">
      <div className="panel mx-auto max-w-2xl px-6 py-12 text-center sm:px-10" role="alert">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--danger)]">
          <TriangleAlert aria-hidden="true" size={32} />
        </span>
        <h1 className="page-title mt-6">화면을 불러오지 못했어요.</h1>
        <p className="supporting-copy mx-auto mt-4">인터넷 연결을 확인한 뒤 다시 시도해 주세요. 작성 중인 내용은 가능한 한 그대로 유지됩니다.</p>
        <button type="button" className="button-primary mt-6" onClick={reset}>
          <RefreshCw aria-hidden="true" size={21} /> 다시 불러오기
        </button>
      </div>
    </div>
  );
}
