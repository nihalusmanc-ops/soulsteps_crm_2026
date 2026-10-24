CREATE TABLE `meta_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`form_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`cursor` text,
	`last_scan_at` text,
	`last_scan_count` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_page_form` ON `meta_forms` (`page_id`,`form_id`);--> statement-breakpoint
CREATE TABLE `meta_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`form_id` text NOT NULL,
	`mode` text NOT NULL,
	`notification` text NOT NULL,
	`payload` text,
	`received_at` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text NOT NULL,
	`lease_until` text,
	`token` text,
	`last_error` text,
	`enquiry_id` text,
	`mapping_version` integer,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meta_pending_retry` ON `meta_leads` (`status`,`next_retry_at`);