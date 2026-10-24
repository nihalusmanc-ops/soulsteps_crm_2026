CREATE TABLE `trip_content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_trip_version` ON `trip_content_versions` (`trip_id`,`version`);
--> statement-breakpoint
INSERT OR IGNORE INTO users(id,email,role,active,display_name) VALUES('SYSTEM','system@example.invalid','manager',0,'System checks');
--> statement-breakpoint
INSERT OR IGNORE INTO workspace_settings(id,version,data) VALUES('workspace',0,'{"version":0,"timezone":"Asia/Dubai","businessStart":"09:00","businessEnd":"18:00","workingDays":[1,2,3,4,5],"defaultFollowupHours":24,"reminderMinutes":0,"maxAttempts":5,"jobsPaused":false,"recoveryHold":false,"outboundEnabled":false,"stages":{"NEW":{"label":"New enquiry","color":"#6d28d9"},"QUALIFYING":{"label":"Initial discussion","color":"#0e6975"},"INTERESTED":{"label":"Interested","color":"#1d4ed8"},"PROPOSAL_SENT":{"label":"Proposal sent","color":"#92400e"},"DECISION_PENDING":{"label":"Decision pending","color":"#92400e"},"AWAITING_DEPOSIT":{"label":"Awaiting deposit","color":"#9a3412"},"CONFIRMED":{"label":"Booking confirmed","color":"#166534"},"ON_HOLD":{"label":"On hold","color":"#475569"},"LOST":{"label":"Lost","color":"#991b1b"},"NOT_SUITABLE":{"label":"Not suitable","color":"#4b5563"}}}');
