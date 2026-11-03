"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Room, RoomFormValues } from "@/types/rooms";

export interface UseRoomsResult {
  rooms: Room[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isMutating: boolean;
  addRoom: (values: RoomFormValues) => Promise<void>;
  updateRoom: (id: string, values: RoomFormValues) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
}

export function useRooms(): UseRoomsResult {
  const listQuery = useQuery(api.rooms.listAll);
  const addRoomMutation = useMutation(api.rooms.create);
  const updateRoomMutation = useMutation(api.rooms.update);
  const deleteRoomMutation = useMutation(api.rooms.remove);

  const [isMutating, setIsMutating] = useState(false);

  const isLoading = listQuery === undefined;
  const error = listQuery?.ok === false ? listQuery.error : null;

  const rooms = listQuery?.ok ? listQuery.data : [];
  const isEmpty = !isLoading && !error && rooms.length === 0;

  const addRoom = useCallback(
    async (values: RoomFormValues) => {
      setIsMutating(true);
      try {
        await addRoomMutation(values);
      } finally {
        setIsMutating(false);
      }
    },
    [addRoomMutation],
  );

  const updateRoom = useCallback(
    async (id: string, values: RoomFormValues) => {
      setIsMutating(true);
      try {
        await updateRoomMutation({ id: id as Id<"rooms">, ...values });
      } finally {
        setIsMutating(false);
      }
    },
    [updateRoomMutation],
  );

  const deleteRoom = useCallback(
    async (id: string) => {
      setIsMutating(true);
      try {
        await deleteRoomMutation({ id: id as Id<"rooms"> });
      } finally {
        setIsMutating(false);
      }
    },
    [deleteRoomMutation],
  );

  return {
    rooms,
    isLoading,
    isEmpty,
    error,
    isMutating,
    addRoom,
    updateRoom,
    deleteRoom,
  };
}