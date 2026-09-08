export type Role =
  | "HOST"
  | "MODERATOR"
  | "PARTICIPANT"
  | "VIEWER";

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface Room {
  id: number;
  room_code: string;
  name: string;
  host_id: number;
  video_id: string | null;
}

export interface Participant {
  user_id: number;
  username: string;
  role: Role;
}