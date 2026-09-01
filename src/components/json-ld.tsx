import { serializeJsonLd } from "@/lib/seo";

type JsonLdProps = {
  data: unknown;
};

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      type="application/ld+json"
    />
  );
}
