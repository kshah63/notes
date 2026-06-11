import { Badge } from "./ui";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

const tone: Record<Channel, "neutral" | "accent" | "green" | "amber" | "red"> = {
  call: "accent",
  whatsapp: "green",
  in_person: "amber",
  video: "neutral",
  email: "neutral",
};

export function ChannelBadge({ channel }: { channel: Channel }) {
  return <Badge tone={tone[channel]}>{CHANNEL_LABELS[channel]}</Badge>;
}
