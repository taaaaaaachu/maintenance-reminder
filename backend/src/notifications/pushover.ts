export async function sendPushoverMessage(
  apiToken: string,
  userKey: string,
  title: string,
  message: string,
  url?: string,
): Promise<void> {
  const params: Record<string, string> = { token: apiToken, user: userKey, title, message };
  if (url) {
    params.url = url;
    params.url_title = "リマインダーを開く";
  }
  const body = new URLSearchParams(params);

  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Pushover送信に失敗しました (${res.status}): ${await res.text()}`);
  }
}
