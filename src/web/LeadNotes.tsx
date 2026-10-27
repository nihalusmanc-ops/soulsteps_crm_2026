import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { RefObject } from "react";
import {
  dateTime,
  nextTask,
  stages,
  isOpen,
  type Enquiry,
} from "../shared/domain";
import { leadColourLabels } from "../shared/workbook-context";
import { Button } from "./components/ui/button";

export const clientNote = (e: Enquiry) =>
  e.activities.find((a) => a.type === "note")?.text ||
  e.workbook?.latestNote ||
  (e.workbook
    ? "No staff note recorded in the workbook."
    : e.originalNote || "No client note yet.");
export function WorkbookBadge({ e }: { e: Enquiry }) {
  return e.workbook ? (
    <span
      className={`workbook-badge colour-${e.workbook.colour}`}
      title="Client-defined workbook colour status"
    >
      {leadColourLabels[e.workbook.colour]}
    </span>
  ) : null;
}
export function SourceFollowup({ e }: { e: Enquiry }) {
  const followup = e.workbook?.followup;
  if (!followup) return null;
  return (
    <div className="source-followup">
      <strong>Workbook follow-up</strong>
      <span>
        {followup.date
          ? new Date(followup.date + "T12:00:00Z").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }) + (followup.time ? ` · ${followup.time} Dubai` : "")
          : followup.text}
      </span>
      <small>{followup.reason}</small>
    </div>
  );
}
export function LeadNoteCard({ e }: { e: Enquiry }) {
  const task = nextTask(e);
  const next = task
    ? `${task.type} · ${dateTime(task.due)}`
    : !isOpen(e)
      ? stages[e.stage]
      : e.workbook?.nextStep || "Agree the next step with the customer.";
  return (
    <section className="lead-note-content">
      <h3>Client note</h3>
      <p className="client-note-text">{clientNote(e)}</p>
      <div className="note-next-step">
        <strong>Next step</strong>
        <p>{next}</p>
      </div>
      <SourceFollowup e={e} />
      {!!e.workbook?.reviewReasons.length && (
        <p className="notice">{e.workbook.reviewReasons.join(" ")}</p>
      )}
    </section>
  );
}
export function LeadNotesDrawer({
  enquiry,
  onClose,
  returnFocus,
}: {
  enquiry: Enquiry | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog.Root
      open={!!enquiry}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="notes-overlay" />
        <Dialog.Content
          className="lead-notes-drawer"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <div className="section-head">
            <Dialog.Title>Client notes</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label="Close client notes"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {enquiry?.name}
          </Dialog.Description>
          {enquiry && (
            <>
              <WorkbookBadge e={enquiry} />
              <LeadNoteCard e={enquiry} />
              {enquiry.activities.some((a) => a.type === "note") && (
                <section className="note-history">
                  <h3>Staff notes</h3>
                  {enquiry.activities
                    .filter((a) => a.type === "note")
                    .map((a) => (
                      <div key={a.id}>
                        <p>{a.text}</p>
                        <small>
                          {a.actor} · {dateTime(a.at)}
                        </small>
                      </div>
                    ))}
                </section>
              )}
              {!!enquiry.workbook?.notes.length && (
                <details className="note-history">
                  <summary>
                    All workbook notes ({enquiry.workbook.notes.length})
                  </summary>
                  {enquiry.workbook.notes.map((n, i) => (
                    <div key={i}>
                      <p>{n.text}</p>
                      <small>
                        {n.sheet} · {n.cell}
                      </small>
                    </div>
                  ))}
                </details>
              )}
              <Button asChild variant="outline">
                <Link to={`/enquiries/${enquiry.id}`} onClick={onClose}>
                  Open enquiry
                </Link>
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
