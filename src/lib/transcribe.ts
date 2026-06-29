// Transcribe a Twilio-hosted audio message (WhatsApp voice note) via Deepgram.
// Twilio media URLs require basic auth to fetch, so we download the bytes first
// and post them to Deepgram. Server-side only.

export function isDeepgramConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export async function transcribeTwilioMedia(
  mediaUrl: string,
  contentType: string | null,
): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    throw new Error("DEEPGRAM_API_KEY is not set — cannot transcribe voice notes.");
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials missing — cannot fetch the audio.");
  }

  const basic = Buffer.from(`${sid}:${token}`).toString("base64");
  const audioRes = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!audioRes.ok) {
    throw new Error(`Could not download audio (${audioRes.status}).`);
  }
  const audio = Buffer.from(await audioRes.arrayBuffer());

  const dgRes = await fetch(
    "https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&model=nova-2",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": contentType || "audio/ogg",
      },
      body: audio,
    },
  );
  if (!dgRes.ok) {
    const body = await dgRes.text().catch(() => "");
    throw new Error(`Deepgram error ${dgRes.status}: ${body.slice(0, 200)}`);
  }
  const json = (await dgRes.json()) as {
    results?: {
      channels?: { alternatives?: { transcript?: string }[] }[];
    };
  };
  return (
    json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ""
  );
}
