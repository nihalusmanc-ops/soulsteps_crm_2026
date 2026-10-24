ALTER TABLE `backup_runs` ADD `cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_runs` ADD `receipt_manifest` text DEFAULT '[]' NOT NULL;