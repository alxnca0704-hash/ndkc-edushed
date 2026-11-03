export type RoomType = "lecture" | "lab";

export interface Room {
  _id: string;
  name: string;
  type: RoomType;
  createdAt: number;
  updatedAt: number;
}

export interface RoomFormValues {
  name: string;
  type: RoomType;
}