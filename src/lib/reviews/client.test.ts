import { describe, expect, it, vi } from "vitest";

import { submitEventReview } from "@/lib/reviews/client";

const review = {
  id: "review-1",
  eventId: "event/1",
  rating: 5,
  content: "함께 걸으며 나눈 이야기가 오래 기억에 남을 것 같습니다.",
  author: { id: "member-1", name: "김회원" },
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
};

describe("review client", () => {
  it("submits normalized content to the same-origin BFF and validates the response", async () => {
    const request = vi.fn(async () => Response.json(review, { status: 201 }));

    await expect(
      submitEventReview(
        "event/1",
        { rating: 5, content: `  ${review.content}  ` },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).resolves.toEqual(review);

    expect(request).toHaveBeenCalledWith(
      "/api/events/event%2F1/reviews",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 5, content: review.content }),
      }),
    );
  });

  it("preserves the backend eligibility message and machine code", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "REVIEW_NOT_ALLOWED",
            message: "출석이 확인된 참가자만 후기를 작성할 수 있습니다.",
          },
        },
        { status: 409 },
      ),
    );

    const outcome = submitEventReview(
      "event-1",
      { rating: 4, content: "참석 확인을 기다리고 있는 후기 내용입니다." },
      { fetchImplementation: request as unknown as typeof fetch },
    );

    await expect(outcome).rejects.toMatchObject({
      status: 409,
      code: "REVIEW_NOT_ALLOWED",
      message: "출석이 확인된 참가자만 후기를 작성할 수 있습니다.",
    });
  });

  it("rejects invalid input without spending an API request", async () => {
    const request = vi.fn();

    await expect(
      submitEventReview(
        "event-1",
        { rating: 6, content: "충분히 긴 후기 내용입니다." },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).rejects.toThrow("별점과 10~800자의 후기 내용을 확인해 주세요.");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects malformed or mismatched success responses", async () => {
    const malformed = vi.fn(async () => Response.json({ id: "review-1" }));
    const mismatched = vi.fn(async () =>
      Response.json({ ...review, eventId: "event-2" }),
    );

    await expect(
      submitEventReview(
        "event-1",
        { rating: 5, content: review.content },
        { fetchImplementation: malformed as unknown as typeof fetch },
      ),
    ).rejects.toThrow("후기 서버 응답을 확인하지 못했습니다.");
    await expect(
      submitEventReview(
        "event-1",
        { rating: 5, content: review.content },
        { fetchImplementation: mismatched as unknown as typeof fetch },
      ),
    ).rejects.toThrow("등록된 후기의 모임 정보를 확인하지 못했습니다.");
  });

  it("retries with the exact same normalized payload", async () => {
    const request = vi.fn(async () => Response.json(review, { status: 201 }));
    const options = { fetchImplementation: request as unknown as typeof fetch };
    const input = { rating: 5, content: ` ${review.content} ` };

    await submitEventReview("event/1", input, options);
    await submitEventReview("event/1", input, options);

    const calls = request.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    expect(request).toHaveBeenCalledTimes(2);
    expect(calls[0]?.[1]?.body).toBe(calls[1]?.[1]?.body);
  });

  it("uses a 12-second default timeout and reports a friendly timeout error", async () => {
    const timeoutController = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutController.signal);
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const outcome = submitEventReview(
      "event-1",
      { rating: 5, content: review.content },
      { fetchImplementation: request as unknown as typeof fetch },
    );
    expect(timeout).toHaveBeenCalledWith(12_000);
    timeoutController.abort(new DOMException("Timed out", "TimeoutError"));

    await expect(outcome).rejects.toMatchObject({
      status: 408,
      code: "REQUEST_TIMEOUT",
      message: "서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.",
    });
    timeout.mockRestore();
  });

  it("composes a caller abort signal without misreporting it as a timeout", async () => {
    const caller = new AbortController();
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          expect(init?.signal).not.toBe(caller.signal);
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const outcome = submitEventReview(
      "event-1",
      { rating: 5, content: review.content },
      {
        fetchImplementation: request as unknown as typeof fetch,
        signal: caller.signal,
      },
    );
    caller.abort();

    await expect(outcome).rejects.toMatchObject({
      status: 0,
      code: "REQUEST_ABORTED",
      message: "후기 등록 요청이 취소되었습니다.",
    });
  });
});
