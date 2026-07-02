export async function sendLineMessage(accessToken: string, userId: string, text: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });

  if (!res.ok) {
    throw new Error(`LINE送信に失敗しました (${res.status}): ${await res.text()}`);
  }
}

export async function replyLineMessage(accessToken: string, replyToken: string, text: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });

  if (!res.ok) {
    throw new Error(`LINE返信に失敗しました (${res.status}): ${await res.text()}`);
  }
}

export async function verifyLineSignature(channelSecret: string, rawBody: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return computed === signature;
}
