import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-container page-content">
      <div className="panel mx-auto max-w-2xl px-6 py-12 text-center sm:px-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--sky-soft)] text-[var(--primary)]">
          <Compass aria-hidden="true" size={32} />
        </span>
        <p className="eyebrow mt-6">길을 다시 찾아볼까요?</p>
        <h1 className="page-title">요청하신 화면을 찾지 못했어요.</h1>
        <p className="supporting-copy mx-auto mt-4">주소가 바뀌었거나 모임이 종료되었을 수 있습니다. 홈에서 현재 참여할 수 있는 모임을 확인해 주세요.</p>
        <Link href="/" className="button-primary mt-6">
          <ArrowLeft aria-hidden="true" size={21} /> 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
