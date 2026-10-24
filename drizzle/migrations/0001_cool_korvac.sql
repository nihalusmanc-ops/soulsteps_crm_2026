CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_enquiry_time` ON `activities` (`enquiry_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`object_id` text NOT NULL,
	`action` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_object_time` ON `audit_events` (`object_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`reference` text NOT NULL,
	`quotation_id` text NOT NULL,
	`amount` integer NOT NULL,
	`required_deposit` integer NOT NULL,
	`currency` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_enquiry_id_unique` ON `bookings` (`enquiry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_reference_unique` ON `bookings` (`reference`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone_e164` text,
	`email` text,
	`contact_validity` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_phone` ON `customers` (`phone_e164`);--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`stage` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`write_token` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nonnegative_revision" CHECK("enquiries"."revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX `enquiry_owner_stage` ON `enquiries` (`owner_id`,`stage`);--> statement-breakpoint
CREATE INDEX `enquiry_trip_stage` ON `enquiries` (`trip_id`,`stage`);--> statement-breakpoint
CREATE INDEX `enquiry_created` ON `enquiries` (`created_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`payment_id` text,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	`uploaded_by` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_unique` ON `files` (`object_key`);--> statement-breakpoint
CREATE INDEX `file_enquiry` ON `files` (`enquiry_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`resource` text NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`received_at` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_payment_amount" CHECK("payments"."amount" > 0),
	CONSTRAINT "valid_payment_status" CHECK("payments"."status" IN ('pending','verified','reversed'))
);
--> statement-breakpoint
CREATE INDEX `payment_enquiry_status` ON `payments` (`enquiry_id`,`status`);--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`amount` integer NOT NULL,
	`required_deposit` integer,
	`currency` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_quote_amount" CHECK("quotations"."amount" > 0 AND ("quotations"."required_deposit" IS NULL OR ("quotations"."required_deposit" > 0 AND "quotations"."required_deposit" <= "quotations"."amount")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_enquiry_id` ON `quotations` (`enquiry_id`,`id`);--> statement-breakpoint
CREATE TABLE `enquiry_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_key` text,
	`original_note` text NOT NULL,
	`raw_data` text,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enquiry_sources_external_key_unique` ON `enquiry_sources` (`external_key`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_task_status" CHECK("tasks"."status" IN ('pending','completed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `task_owner_status_due` ON `tasks` (`owner_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`identity_subject` text,
	`display_name` text DEFAULT 'Staff member' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "valid_role" CHECK("__new_users"."role" IN ('staff','manager'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "role", "active", "identity_subject", "display_name", "created_at") SELECT "id", "email", "role", "active", NULL, 'Staff member', CURRENT_TIMESTAMP FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_identity_subject_unique` ON `users` (`identity_subject`);