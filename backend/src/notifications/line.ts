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
