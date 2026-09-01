import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "시니어클럽",
    short_name: "시니어클럽",
    description: "같은 목적을 가진 사람과 만나 활동하고 관계를 이어가는 커뮤니티",
    start_url: "/",
    display: "standalone",
    background_color: "#edf4f4",
    theme_color: "#176956",
    lang: "ko-KR",
    icons: [
      {
        src: "/images/senior-club-mark-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/senior-club-maskable-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
