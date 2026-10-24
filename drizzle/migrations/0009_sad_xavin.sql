CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`checksum` text NOT NULL,
	`mapping_version` text NOT NULL,
	`raw_text` text NOT NULL,
	`object_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_checksum_unique` ON `import_batches` (`checksum`);--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`review` text,
	`enquiry_id` text,
	`error` text,
	`token` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batch_row` ON `import_rows` (`batch_id`,`row_number`);