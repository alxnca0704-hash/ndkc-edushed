"use client";

import { useMemo, useState } from "react";
import { DoorOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { RoomDeleteDialog } from "@/components/rooms/RoomDeleteDialog";
import { RoomFormDialog } from "@/components/rooms/RoomFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROOM_TYPE_LABELS } from "@/constants/rooms";
import { useRooms } from "@/hooks/useRooms";
import type { Room, RoomFormValues } from "@/types/rooms";

const SKELETON_ROWS = 5;

export function RoomManagement() {
  const { rooms, isLoading, isEmpty, error, addRoom, updateRoom, deleteRoom } =
    useRooms();

  const [search, setSearch] = useState("");
  const [formSession, setFormSession] = useState<{
    room: Room | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rooms;
    }
    return rooms.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        ROOM_TYPE_LABELS[room.type].toLowerCase().includes(query),
    );
  }, [rooms, search]);

  function openCreate() {
    setFormSession({ room: null });
  }

  function openEdit(room: Room) {
    setFormSession({ room });
  }

  function handleRoomErrorRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Room</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-7 w-14" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load rooms"
          message={error}
          onRetry={handleRoomErrorRetry}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={DoorOpen}
          title="No rooms yet"
          description="Add your first room to start building the schedule."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Add room
            </Button>
          }
        />
      );
    }

    if (filteredRooms.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title="No matching rooms"
          description={`Nothing matches "${search}".`}
          action={
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Room</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRooms.map((room) => (
            <TableRow key={room._id}>
              <TableCell className="font-medium">{room.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{ROOM_TYPE_LABELS[room.type]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${room.name}`}
                    onClick={() => openEdit(room)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${room.name}`}
                    onClick={() => setDeleting(room)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Manage Rooms</h1>
        <p className="text-sm text-muted-foreground">
          Add, update, and remove rooms for scheduling.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rooms..."
            className="pl-8"
            aria-label="Search rooms"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add room
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>

      {formSession ? (
        <RoomFormDialog
          key={formSession.room?._id ?? "new"}
          room={formSession.room ?? undefined}
          onSubmit={
            formSession.room
              ? (values: RoomFormValues) =>
                  updateRoom(formSession.room!._id, values)
              : addRoom
          }
          onClose={() => setFormSession(null)}
        />
      ) : null}

      {deleting ? (
        <RoomDeleteDialog
          key={`room-delete-${deleting._id}`}
          room={deleting}
          onConfirm={deleteRoom}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}