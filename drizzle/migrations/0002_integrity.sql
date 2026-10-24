CREATE TRIGGER activities_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT, 'Activities are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER activities_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT, 'Activities are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER quotes_no_update BEFORE UPDATE ON quotations BEGIN SELECT RAISE(ABORT, 'Issued quotations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER quotes_no_delete BEFORE DELETE ON quotations BEGIN SELECT RAISE(ABORT, 'Issued quotations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'Reverse payments instead of deleting'); END;
--> statement-breakpoint
CREATE TRIGGER payments_immutable_amount BEFORE UPDATE OF amount,currency,enquiry_id ON payments BEGIN SELECT RAISE(ABORT, 'Payment amounts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit is append-only'); END;
