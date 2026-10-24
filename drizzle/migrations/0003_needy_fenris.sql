CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`object_key` text,
	`checksum` text,
	`counts` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`phase` text NOT NULL,
	`at` text NOT NULL,
	`outcome` text NOT NULL,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `scheduled_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_attempt_history` ON `job_attempts` (`job_id`,`at`);--> statement-breakpoint
CREATE TABLE `in_app_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`enquiry_id` text NOT NULL,
	`task_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `scheduled_actions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `in_app_notifications_job_id_unique` ON `in_app_notifications` (`job_id`);--> statement-breakpoint
CREATE INDEX `notification_owner_unread` ON `in_app_notifications` (`owner_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `rule_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`trip_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`data` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `priority_rule_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`version` integer NOT NULL,
	`rules` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_trip_version` ON `priority_rule_versions` (`trip_id`,`version`);--> statement-breakpoint
CREATE TABLE `scheduled_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`enquiry_id` text,
	`task_id` text,
	`due_at` text NOT NULL,
	`expected_due` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`dispatch_attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text NOT NULL,
	`lease_until` text,
	`token` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_status_check" CHECK("scheduled_actions"."status" IN ('pending','queued','processing','succeeded','failed','cancelled','held')),
	CONSTRAINT "job_kind_check" CHECK("scheduled_actions"."kind" IN ('task_due','backup'))
);
--> statement-breakpoint
CREATE INDEX `jobs_due_status_retry` ON `scheduled_actions` (`status`,`due_at`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `jobs_task` ON `scheduled_actions` (`task_id`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`write_token` text
);
