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

export const enquiryText = (text: string) =>
  text
    .replace(/Meta workbook/gi, "Meta")
    .replace(/Workbook import/gi, "Import")
    .replace(/\bworkbooks\b/gi, "records")
    .replace(/\bworkbook\b/gi, "record");
export const clientNote = (e: Enquiry) =>
  enquiryText(
    e.activities.find((a) => a.type === "note")?.text ||
      e.workbook?.latestNote ||
      (e.workbook ? "No note recorded yet." : e.originalNote || "No note yet."),
  );
export function WorkbookBadge({ e }: { e: Enquiry }) {
  return e.workbook ? (
    <span
      className={`workbook-badge colour-${e.workbook.colour}`}
      title="Lead status"
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
      <strong>Follow-up</strong>
      <span>
        {followup.date
          ? new Date(followup.date + "T12:00:00Z").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }) + (followup.time ? ` · ${followup.time} Dubai` : "")
          : enquiryText(followup.text)}
      </span>
      <small>{enquiryText(followup.reason)}</small>
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
      <h3>Note</h3>
      <p className="client-note-text">{clientNote(e)}</p>
      <div className="note-next-step">
        <strong>Next step</strong>
        <p>{enquiryText(next)}</p>
      </div>
      <SourceFollowup e={e} />
      {!!e.workbook?.reviewReasons.length && (
        <p className="notice">
          {enquiryText(e.workbook.reviewReasons.join(" "))}
        </p>
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
            <Dialog.Title>Note</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close note">
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
                        <p>{enquiryText(a.text)}</p>
                        <small>
                          {enquiryText(a.actor)} · {dateTime(a.at)}
                        </small>
                      </div>
                    ))}
                </section>
              )}
              {!!enquiry.workbook?.notes.length && (
                <details className="note-history">
                  <summary>All notes ({enquiry.workbook.notes.length})</summary>
                  {enquiry.workbook.notes.map((n, i) => (
                    <div key={i}>
                      <p>{enquiryText(n.text)}</p>
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
