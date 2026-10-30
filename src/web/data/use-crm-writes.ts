import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { Identity } from "../../shared/api";
import type { Command, State, Trip } from "../../shared/domain";
import { apiRepository, ApiRequestError, deleteRecord } from "./api";
import { previewWrite, rollbackWrite, type CrmWrite } from "./optimistic";

export function useCrmWrites(actor?: Identity, blocked?: () => boolean) {
  const client = useQueryClient();
  const lock = useRef(false);
  const mutation = useMutation({
    mutationKey: ["crm-write", actor?.id],
    retry: false,
    mutationFn: async ({
      write,
    }: {
      write: CrmWrite;
      actor: Identity;
      onPreview?: () => void;
      replay?: boolean;
    }) => {
      if (write.kind === "command")
        await apiRepository.command(write.id, write.revision, write.command);
      else if (write.kind === "delete")
        await deleteRecord(write.resource, write.id, write.revision);
      else await apiRepository.saveTrip(write.trip);
    },
    onMutate: async ({ write, onPreview, actor, replay }) => {
      const key = ["crm", actor.id];
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<State>(key);
      if (!actor || !previous)
        throw new Error("Reload the workspace before saving.");
      // A failed response may have committed. Retry the original request/key,
      // even when reconciliation has already advanced the saved revision.
      const preview = replay ? null : previewWrite(previous, write, actor);
      if (preview) {
        client.setQueryData(key, preview);
        onPreview?.();
      }
      return { previous, previewed: !!preview, key };
    },
    onError: (_error, { write }, context) => {
      if (context?.previewed)
        client.setQueryData<State>(context.key, (current) =>
          current ? rollbackWrite(current, context.previous, write) : undefined,
        );
    },
    onSettled: async (_data, _error, { write, actor }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["crm", actor.id], exact: true }),
        client.invalidateQueries({ queryKey: ["reports-access"] }),
        ...(client.isMutating({ mutationKey: ["reminder-seen"] })
          ? []
          : [client.invalidateQueries({ queryKey: ["reminders"] })]),
        ...(write.kind === "command" && write.command.type === "qualify"
          ? [client.invalidateQueries({ queryKey: ["customers"] })]
          : []),
      ]);
    },
  });
  async function save(write: CrmWrite, onPreview?: () => void, replay = false) {
    if (lock.current || blocked?.() || !actor) return false;
    lock.current = true;
    try {
      await mutation.mutateAsync({ write, onPreview, actor, replay });
      return true;
    } catch {
      return false;
    } finally {
      lock.current = false;
    }
  }
  const retryable =
    mutation.error instanceof TypeError ||
    (mutation.error instanceof ApiRequestError &&
      (mutation.error.status >= 500 || mutation.error.status === 429));
  const sameActor = mutation.variables?.actor.id === actor?.id;
  return {
    pending: mutation.isPending,
    succeeded: mutation.isSuccess && sameActor,
    locked: () => lock.current || !!blocked?.(),
    error: sameActor ? mutation.error : null,
    failedWrite:
      sameActor && mutation.error ? mutation.variables?.write : undefined,
    retryable: retryable && sameActor,
    reset: mutation.reset,
    retry: () =>
      mutation.variables && sameActor
        ? save(mutation.variables.write, undefined, true)
        : Promise.resolve(false),
    command: (
      id: string,
      revision: number,
      command: Command,
      onPreview?: () => void,
    ) => save({ kind: "command", id, revision, command }, onPreview),
    saveTrip: (trip: Trip, onPreview?: () => void) =>
      save({ kind: "trip", trip }, onPreview),
    remove: (
      resource: "trip" | "enquiry",
      id: string,
      revision: number,
      onPreview?: () => void,
    ) => save({ kind: "delete", resource, id, revision }, onPreview),
  };
}
