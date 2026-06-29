// Domain types mirroring supabase/migrations/0001_init.sql.

export type Channel = "call" | "whatsapp" | "in_person" | "video" | "email";
export type PreferredChannel = "whatsapp" | "call" | "email" | "in_person";
export type InteractionSource = "manual" | "granola";
export type FollowUpStatus = "pending" | "done" | "cancelled";
export type GranolaPath = "paste" | "api";

export const CHANNELS: Channel[] = [
  "call",
  "whatsapp",
  "in_person",
  "video",
  "email",
];

export const CHANNEL_LABELS: Record<Channel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  in_person: "In person",
  video: "Video",
  email: "Email",
};

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  owner_id: string;
  full_name: string;
  level: string | null; // "Grade 11", "University", etc.
  school: string | null;
  courses: string | null;
  external_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface Teacher {
  id: string;
  owner_id: string;
  full_name: string;
  code: string | null;
  position: string | null;
  created_at: string;
}

export interface Parent {
  id: string;
  owner_id: string;
  full_name: string;
  relationship: string | null;
  phone_e164: string | null;
  email: string | null;
  preferred_channel: PreferredChannel;
  created_at: string;
}

export interface Interaction {
  id: string;
  owner_id: string;
  student_id: string | null;
  parent_id: string | null;
  teacher_id: string | null;
  occurred_at: string;
  channel: Channel;
  raw_notes: string | null;
  summary: string | null;
  source: InteractionSource;
  granola_note_id: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  interaction_id: string;
  text: string;
  done: boolean;
  created_at: string;
}

export interface FollowUp {
  id: string;
  owner_id: string;
  interaction_id: string | null;
  student_id: string | null;
  parent_id: string | null;
  due_at: string;
  note: string | null;
  status: FollowUpStatus;
  remind_in_app: boolean;
  remind_whatsapp: boolean;
  reminded_at: string | null;
  created_at: string;
}

export interface AppSettings {
  owner_id: string;
  reminder_whatsapp_number: string | null;
  default_channel: Channel;
  granola_path: GranolaPath;
  nudge_enabled: boolean;
  nudge_start_hour: number;
  nudge_end_hour: number;
  created_at: string;
  updated_at: string;
}

// Shape returned by the AI tidy/extract step.
export interface TidyResult {
  summary: string;
  action_items: string[];
  suggested_follow_up: {
    due_in_days: number | null;
    note: string | null;
  };
}

// Composite rows used by the timeline views.
export interface InteractionWithDetails extends Interaction {
  student: Pick<Student, "id" | "full_name" | "level"> | null;
  parent: Pick<Parent, "id" | "full_name" | "relationship"> | null;
  teacher: Pick<Teacher, "id" | "full_name"> | null;
  action_items: ActionItem[];
  follow_ups: FollowUp[];
}
