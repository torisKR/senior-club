import type { Metadata } from "next";
import { MessageCircleMore } from "lucide-react";

import { ChatRoom } from "@/components/chat-room";
import { requireServerUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "모임 채팅",
  description: "승인된 모임의 참가자와 일정과 준비물을 나누는 대화방입니다.",
};

export default async function ChatPage() {
  const user = await requireServerUser("/chat");

  return (
    <div className="page-container page-content">
      <header className="mb-7">
        <p className="eyebrow">
          <MessageCircleMore aria-hidden="true" className="size-5" />
          활동이 관계로 이어지는 곳
        </p>
        <h1 className="page-title">모임 대화방</h1>
        <p className="supporting-copy mt-3">
          참가 승인이 완료된 모임 친구들과 만나는 곳, 준비물, 안부를 편하게 나눠보세요.
        </p>
      </header>

      <ChatRoom currentUser={{ id: user.id, name: user.name }} />
    </div>
  );
}
