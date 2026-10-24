CREATE TRIGGER rules_no_update BEFORE UPDATE ON priority_rule_versions BEGIN SELECT RAISE(ABORT, 'Published rules are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER rules_no_delete BEFORE DELETE ON priority_rule_versions BEGIN SELECT RAISE(ABORT, 'Published rules are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_no_update BEFORE UPDATE ON trip_content_versions BEGIN SELECT RAISE(ABORT, 'Published content is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_no_delete BEFORE DELETE ON trip_content_versions BEGIN SELECT RAISE(ABORT, 'Published content is immutable'); END;
