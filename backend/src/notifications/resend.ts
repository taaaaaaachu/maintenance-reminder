export async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    throw new Error(`メール送信に失敗しました (${res.status}): ${await res.text()}`);
  }
}
